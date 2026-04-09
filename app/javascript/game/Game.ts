import {
  Player,
  Direction,
  CharacterClass,
  GameMapData,
  VideoMode,
  ISO_TILE_H,
} from "./types";
import { Camera, tileToScreen } from "./Camera";
import { TileMap } from "./TileMap";
import { InputManager } from "./InputManager";
import { PlayerRenderer } from "./PlayerRenderer";
import { IdentityManager, AuthResult } from "../ui/IdentityManager";
import { CableClient } from "../network/CableClient";
import { VideoConnection } from "../network/VideoConnection";
import { ProximityVideo } from "../network/ProximityVideo";
import { ExplicitVideo } from "../network/ExplicitVideo";
import { Aura } from "./Aura";
import { ConnectionLine } from "./ConnectionLine";

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;
  private tileMap: TileMap | null = null;
  private input: InputManager | null = null;
  private playerRenderer: PlayerRenderer;
  private aura: Aura;
  private connectionLine: ConnectionLine;
  private localPlayer: Player | null = null;
  private remotePlayers: Map<string, Player> = new Map();
  private running = false;
  private lastTime = 0;
  private moveSpeed = 4;
  private cable: CableClient | null = null;
  private video: VideoConnection | null = null;
  private moveBroadcastTimer = 0;
  private moveBroadcastInterval = 1 / 15;
  private positionSaveTimer = 0;
  private positionSaveInterval = 5;
  private currentMapId = 0;
  private onlineUsers = new Set<string>();
  private videoDisabledPlayers = new Set<string>();
  private lastBroadcastVideoEnabled: boolean | null = null;
  private videoStatusBroadcastTimer = 0;
  private attackTimer = 0;
  private readonly attackDuration = 16 / 18; // 16 frames at 18 FPS

  /** Player currently hovered for aura display. */
  private hoveredPlayer: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.camera = new Camera();
    this.playerRenderer = new PlayerRenderer();
    this.aura = new Aura();
    this.connectionLine = new ConnectionLine();

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  start() {
    new IdentityManager((result) => this.onAuthenticated(result));
  }

  private async onAuthenticated(auth: AuthResult) {
    const config = window.__HELLTOWN__;
    let mapData: GameMapData;

    if (config.map) {
      mapData = config.map;
    } else if (config.maps && config.maps.length > 0) {
      const res = await fetch(`/api/maps/${config.maps[0].id}`);
      mapData = await res.json();
    } else {
      console.error("No maps available");
      return;
    }

    this.tileMap = new TileMap(mapData);
    await this.tileMap.load();

    if (this.tileMap.wasGenerated) {
      fetch(`/api/maps/${this.tileMap.mapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tile_data: this.tileMap.serialize(),
          spawn_x: this.tileMap.spawnX,
          spawn_y: this.tileMap.spawnY,
        }),
      }).catch((e) => console.warn("Failed to persist generated dungeon:", e));
    }

    await this.playerRenderer.loadClass(auth.characterClass);
    await this.aura.load();

    const user = config.user;
    const savedOnThisMap =
      user?.last_map_id === mapData.id &&
      user.last_x != null &&
      user.last_y != null;
    const startX = savedOnThisMap ? user.last_x! : this.tileMap.spawnX;
    const startY = savedOnThisMap ? user.last_y! : this.tileMap.spawnY;

    this.localPlayer = {
      username: auth.username,
      x: startX,
      y: startY,
      targetX: startX,
      targetY: startY,
      direction: "s",
      moving: false,
      attacking: false,
      characterClass: auth.characterClass,
      animFrame: 0,
    };
    this.currentMapId = mapData.id;

    this.input = new InputManager(this.canvas, this.camera, (col, row) => {
      this.movePlayerTo(col, row);
    });

    // Handle player clicks for explicit video
    this.input.setPlayerClickCallback((username) => {
      if (this.video?.initiateCallTo) {
        this.video.initiateCallTo(username);
      }
    });

    this.cable = new CableClient(mapData.id);
    this.cable.onMessage((msg) => this.handleCableMessage(msg));
    this.cable.onDirectMessage((msg) => this.handleDirectMessage(msg));
    this.cable.connect();

    // Create video connection based on map's video mode
    const videoMode: VideoMode = mapData.video_mode || "proximity";
    const palettePath = palettePathForTileset(mapData.tileset);
    const tilesetPath = `/game/sprites/tiles/${mapData.tileset}.png`;

    if (videoMode === "explicit") {
      this.video = new ExplicitVideo(
        this.cable,
        auth.username,
        palettePath,
        tilesetPath,
      );
    } else {
      this.video = new ProximityVideo(
        this.cable,
        auth.username,
        palettePath,
        tilesetPath,
      );
    }

    // Wire up End Call button
    const endCallBtn = document.getElementById("end-call-btn");
    endCallBtn?.addEventListener("click", () => {
      this.video?.endCall();
      this.updateEndCallButton();
    });

    // Request media permissions on join (as spec requires)
    this.requestInitialPermissions();

    // Update HUD
    const mapNameEl = document.querySelector(".map-name");
    if (mapNameEl) mapNameEl.textContent = mapData.name;
    this.onlineUsers.add(auth.username);
    this.updateUserList();

    this.camera.followTile(this.localPlayer.x, this.localPlayer.y);
    for (let i = 0; i < 30; i++) this.camera.update();

    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  /** Request mic+video permissions on join with a modal prompt. */
  private async requestInitialPermissions() {
    const settings = window.__HELLTOWN_SETTINGS__;
    if (settings.micEnabled && settings.videoEnabled) return;

    // Check if permissions are already granted via the Permissions API
    try {
      const micPerm = await navigator.permissions.query({ name: "microphone" as PermissionName });
      const camPerm = await navigator.permissions.query({ name: "camera" as PermissionName });
      if (micPerm.state === "granted") settings.micEnabled = true;
      if (camPerm.state === "granted") settings.videoEnabled = true;

      if (settings.micEnabled && settings.videoEnabled) {
        this.updateSettingsUI();
        this.broadcastVideoStatus(true);
        return;
      }

      // Only show the modal + getUserMedia prompt if permissions are not yet granted
      if (micPerm.state === "prompt" || camPerm.state === "prompt") {
        const overlay = document.getElementById("permission-overlay");
        const okBtn = document.getElementById("permission-ok");
        if (overlay && okBtn) {
          overlay.style.display = "";
          await new Promise<void>((resolve) => {
            okBtn.addEventListener("click", () => {
              overlay.style.display = "none";
              resolve();
            }, { once: true });
          });

          // Acquire and immediately release — this triggers the browser prompt
          // Note: the stream is stopped right away. The actual call stream is
          // acquired later in initLocalStream when a call is initiated/received.
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: micPerm.state === "prompt",
              video: camPerm.state === "prompt"
                ? { width: 160, height: 120, frameRate: 15 }
                : false,
            });
            stream.getTracks().forEach((t) => {
              if (t.kind === "audio") settings.micEnabled = true;
              if (t.kind === "video") settings.videoEnabled = true;
              t.stop();
            });
          } catch {
            // User denied — that's fine
          }
        }
      }
    } catch {
      // Permissions API not supported — skip prompt
    }

    this.updateSettingsUI();
    this.broadcastVideoStatus(true);
  }

  private updateSettingsUI() {
    const settings = window.__HELLTOWN_SETTINGS__;
    (window as any).updateSettingsToggle?.("settings-mic", settings.micEnabled);
    (window as any).updateSettingsToggle?.("settings-video", settings.videoEnabled);
    (window as any).updateSettingsWarning?.();
  }

  private handleCableMessage(msg: {
    type: string;
    username?: string;
    x?: number;
    y?: number;
    direction?: string;
    character_class?: string;
    video_enabled?: boolean;
  }) {
    if (!this.localPlayer) return;

    switch (msg.type) {
      case "player_joined":
        if (msg.username && msg.username !== this.localPlayer.username) {
          this.onlineUsers.add(msg.username);
          this.updateUserList();
          // Broadcast our video status to the newly joined player
          this.broadcastVideoStatus(true);
        }
        break;
      case "player_moved": {
        if (msg.username === this.localPlayer.username) return;
        this.onlineUsers.add(msg.username!);
        let player = this.remotePlayers.get(msg.username!);
        if (!player) {
          const cls = (msg.character_class || "warrior") as CharacterClass;
          player = {
            username: msg.username!,
            x: msg.x!,
            y: msg.y!,
            targetX: msg.x!,
            targetY: msg.y!,
            direction: (msg.direction as Direction) || "s",
            moving: false,
            attacking: false,
            characterClass: cls,
            animFrame: 0,
          };
          this.remotePlayers.set(msg.username!, player);
          this.playerRenderer.loadClass(cls);
          this.updateUserList();
        } else {
          player.targetX = msg.x!;
          player.targetY = msg.y!;
          player.direction = (msg.direction as Direction) || player.direction;
          player.moving = true;
        }
        break;
      }
      case "player_left":
        this.remotePlayers.delete(msg.username!);
        this.onlineUsers.delete(msg.username!);
        this.videoDisabledPlayers.delete(msg.username!);
        this.updateUserList();
        // Check if the hub just left
        if (this.video instanceof ExplicitVideo && this.video.isInCall()) {
          const hub = this.video.getHubNode();
          if (hub === msg.username) {
            setTimeout(() => this.showToast("Hub User Disconnected"), 3000);
          }
        }
        break;
      case "video_status":
        if (msg.username && msg.username !== this.localPlayer.username) {
          if (msg.video_enabled) {
            this.videoDisabledPlayers.delete(msg.username);
          } else {
            this.videoDisabledPlayers.add(msg.username);
          }
          // Update the video connection's knowledge of disabled players
          if (this.video instanceof ExplicitVideo) {
            this.video.setDisabledPlayers(this.videoDisabledPlayers);
          }
        }
        break;
    }
  }

  private updateUserList() {
    const countEl = document.getElementById("user-count");
    const listEl = document.getElementById("user-names");
    if (!countEl || !listEl) return;

    const count = this.onlineUsers.size;
    countEl.textContent = `${count} User${count !== 1 ? "s" : ""} Online:`;

    listEl.innerHTML = "";
    for (const username of this.onlineUsers) {
      const li = document.createElement("li");
      if (username !== this.localPlayer?.username) {
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = username;
        link.style.color = "inherit";
        link.style.textDecoration = "none";
        link.addEventListener("click", (e) => {
          e.preventDefault();
          this.openComposeDialog(username);
        });
        link.addEventListener("mouseenter", () => {
          link.style.textDecoration = "underline";
          link.style.color = "#d4a855";
        });
        link.addEventListener("mouseleave", () => {
          link.style.textDecoration = "none";
          link.style.color = "inherit";
        });
        li.appendChild(link);
      } else {
        li.textContent = username;
      }
      listEl.appendChild(li);
    }
  }

  private updateEndCallButton() {
    const btn = document.getElementById("end-call-btn");
    if (btn) {
      btn.style.display = this.video?.isInCall() ? "block" : "none";
    }
  }

  /** Compute whether the local player is video-call-enabled (aggregated from settings flags). */
  private isLocalVideoEnabled(): boolean {
    const s = window.__HELLTOWN_SETTINGS__;
    return s.micEnabled || s.videoEnabled;
  }

  /** Broadcast video status to other players via Action Cable. */
  private broadcastVideoStatus(force = false) {
    const enabled = this.isLocalVideoEnabled();
    if (!force && enabled === this.lastBroadcastVideoEnabled) return;
    this.lastBroadcastVideoEnabled = enabled;
    this.cable?.sendVideoStatus(enabled);
  }

  /** Show a temporary toast message. */
  private showToast(message: string) {
    const toast = document.createElement("div");
    toast.className = "game-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  private handleDirectMessage(msg: {
    type: string;
    from?: string;
    message?: string;
    timestamp?: string;
  }) {
    if (msg.type === "direct_message" && msg.from && msg.message) {
      this.showReceivedMessageDialog(msg.from, msg.message, msg.timestamp);
    }
  }

  private openComposeDialog(toUsername: string) {
    // Remove any existing compose dialog
    document.getElementById("dm-compose-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "dm-compose-overlay";

    const form = document.createElement("div");
    form.id = "dm-compose-form";

    const heading = document.createElement("h2");
    heading.textContent = `Message ${toUsername}`;
    form.appendChild(heading);

    const textarea = document.createElement("textarea");
    textarea.id = "dm-compose-text";
    textarea.placeholder = "Type your message...";
    textarea.maxLength = 2000;
    form.appendChild(textarea);

    const buttons = document.createElement("div");
    buttons.id = "dm-compose-buttons";

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";
    sendBtn.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (text && this.cable) {
        this.cable.sendDirectMessage(toUsername, text);
        overlay.remove();
      }
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => overlay.remove());

    buttons.appendChild(cancelBtn);
    buttons.appendChild(sendBtn);
    form.appendChild(buttons);
    overlay.appendChild(form);
    document.body.appendChild(overlay);

    textarea.focus();

    // Keyboard shortcuts
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        overlay.remove();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  private showReceivedMessageDialog(
    from: string,
    message: string,
    timestamp?: string,
  ) {
    // Remove any existing received DM dialog
    document.getElementById("dm-received-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "dm-received-overlay";

    const form = document.createElement("div");
    form.id = "dm-received-form";

    const header = document.createElement("div");
    header.id = "dm-received-header";

    const fromLine = document.createElement("span");
    fromLine.textContent = `From: ${from}`;
    header.appendChild(fromLine);

    if (timestamp) {
      const timeLine = document.createElement("span");
      const date = new Date(timestamp);
      timeLine.textContent = date.toLocaleString();
      header.appendChild(timeLine);
    }

    form.appendChild(header);

    const body = document.createElement("div");
    body.id = "dm-received-body";
    body.textContent = message;
    form.appendChild(body);

    const buttons = document.createElement("div");
    buttons.id = "dm-received-buttons";

    const replyBtn = document.createElement("button");
    replyBtn.textContent = "Reply";
    replyBtn.addEventListener("click", () => {
      overlay.remove();
      this.openComposeDialog(from);
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => overlay.remove());

    buttons.appendChild(closeBtn);
    buttons.appendChild(replyBtn);
    form.appendChild(buttons);
    overlay.appendChild(form);
    document.body.appendChild(overlay);

    // Escape to close
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", keyHandler);
      }
    };
    document.addEventListener("keydown", keyHandler);
  }

  private resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.camera.setCanvasSize(this.canvas.width, this.canvas.height);
  }

  private movePlayerTo(col: number, row: number) {
    if (!this.localPlayer || !this.tileMap) return;
    if (
      !this.tileMap.canMoveTo(this.localPlayer.x, this.localPlayer.y, col, row)
    )
      return;

    const dx = col - this.localPlayer.x;
    const dy = row - this.localPlayer.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;

    this.localPlayer.targetX = col;
    this.localPlayer.targetY = row;
    this.localPlayer.moving = true;
    this.localPlayer.direction = this.calcDirection(dx, dy);
  }

  private calcDirection(dx: number, dy: number): Direction {
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      return this.localPlayer?.direction ?? "s";
    }
    const angle = Math.atan2(dy, dx);
    const deg = ((angle * 180) / Math.PI + 360) % 360;

    if (deg < 22.5 || deg >= 337.5) return "e";
    if (deg < 67.5) return "se";
    if (deg < 112.5) return "s";
    if (deg < 157.5) return "sw";
    if (deg < 202.5) return "w";
    if (deg < 247.5) return "nw";
    if (deg < 292.5) return "n";
    return "ne";
  }

  private gameLoop(time: number) {
    if (!this.running) return;
    const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private update(dt: number) {
    if (!this.localPlayer || !this.tileMap || !this.input) return;

    this.playerRenderer.updateAnimation(dt);
    this.aura.updateAnimation(dt);

    const arrowDir = this.input.getArrowDirection();
    if (arrowDir) {
      const gridDx = arrowDir.dx + arrowDir.dy;
      const gridDy = arrowDir.dy - arrowDir.dx;
      const len = Math.sqrt(gridDx * gridDx + gridDy * gridDy) || 1;
      const newX = this.localPlayer.x + (gridDx / len) * this.moveSpeed * dt;
      const newY = this.localPlayer.y + (gridDy / len) * this.moveSpeed * dt;

      if (
        this.tileMap.canMoveTo(
          this.localPlayer.x,
          this.localPlayer.y,
          newX,
          newY,
        )
      ) {
        this.localPlayer.x = newX;
        this.localPlayer.y = newY;
        this.localPlayer.direction = this.calcDirection(
          arrowDir.dx,
          arrowDir.dy,
        );
        this.localPlayer.moving = true;
      }
      this.localPlayer.targetX = this.localPlayer.x;
      this.localPlayer.targetY = this.localPlayer.y;
    } else if (this.localPlayer.moving) {
      const dx = this.localPlayer.targetX - this.localPlayer.x;
      const dy = this.localPlayer.targetY - this.localPlayer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.1) {
        this.localPlayer.x = this.localPlayer.targetX;
        this.localPlayer.y = this.localPlayer.targetY;
        this.localPlayer.moving = false;
      } else {
        const step = Math.min(this.moveSpeed * dt, dist);
        const nextX = this.localPlayer.x + (dx / dist) * step;
        const nextY = this.localPlayer.y + (dy / dist) * step;
        if (
          this.tileMap.canMoveTo(
            this.localPlayer.x,
            this.localPlayer.y,
            nextX,
            nextY,
          )
        ) {
          this.localPlayer.x = nextX;
          this.localPlayer.y = nextY;
          this.localPlayer.direction = this.calcDirection(dx, dy);
        } else {
          this.localPlayer.moving = false;
        }
      }
    }

    // Attack: start on X press, play full animation then stop
    if (this.input.isAttackPressed() && !this.localPlayer.attacking) {
      this.localPlayer.attacking = true;
      this.attackTimer = 0;
    }
    if (this.localPlayer.attacking) {
      this.attackTimer += dt;
      if (this.attackTimer >= this.attackDuration) {
        this.localPlayer.attacking = false;
      }
    }

    if (this.input.isMouseHeld() && !arrowDir) {
      const mt = this.input.getMouseTile();
      this.movePlayerTo(mt.col, mt.row);
    }

    for (const player of this.remotePlayers.values()) {
      if (player.moving) {
        const dx = player.targetX - player.x;
        const dy = player.targetY - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.05) {
          player.x = player.targetX;
          player.y = player.targetY;
          player.moving = false;
        } else {
          const step = Math.min(this.moveSpeed * dt * 1.2, dist);
          player.x += (dx / dist) * step;
          player.y += (dy / dist) * step;
        }
      }
    }

    this.moveBroadcastTimer += dt;
    if (this.moveBroadcastTimer >= this.moveBroadcastInterval && this.cable) {
      this.moveBroadcastTimer = 0;
      this.cable.sendMove(
        this.localPlayer.x,
        this.localPlayer.y,
        this.localPlayer.direction,
      );
    }

    if (this.video) {
      const positions = new Map<string, { x: number; y: number }>();
      for (const [name, p] of this.remotePlayers) {
        positions.set(name, { x: p.x, y: p.y });
      }
      this.video.update(this.localPlayer.x, this.localPlayer.y, positions);
      this.updateEndCallButton();
    }

    // Hit-test mouse against player sprites for hover
    this.updateHoveredPlayer();

    // Periodically save position
    this.positionSaveTimer += dt;
    if (this.positionSaveTimer >= this.positionSaveInterval) {
      this.positionSaveTimer = 0;
      fetch("/session/position", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          map_id: this.currentMapId,
          x: this.localPlayer.x,
          y: this.localPlayer.y,
        }),
      }).catch(() => {});
    }

    // Periodically broadcast video status (check for changes every second)
    this.videoStatusBroadcastTimer += dt;
    if (this.videoStatusBroadcastTimer >= 1) {
      this.videoStatusBroadcastTimer = 0;
      this.broadcastVideoStatus();
    }

    this.camera.followTile(this.localPlayer.x, this.localPlayer.y);
    this.camera.update();
  }

  /** Determine which remote player (if any) is under the cursor. */
  private updateHoveredPlayer() {
    if (!this.input || !this.localPlayer) {
      this.hoveredPlayer = null;
      this.input && (this.input.hoveredPlayer = null);
      return;
    }

    const mousePos = this.input.getMouseCanvasPos();
    const hitRadius = 24 * this.camera.zoom; // generous hit area around player center

    let closest: string | null = null;
    let closestDist = Infinity;

    for (const [username, player] of this.remotePlayers) {
      const [isoX, isoY] = tileToScreen(player.x, player.y);
      const canvasPos = this.camera.screenToCanvas(isoX, isoY);

      // Offset upward since the player sprite center is above the tile position
      const playerCenterY = canvasPos.y - 16 * this.camera.zoom;

      const dx = mousePos.x - canvasPos.x;
      const dy = mousePos.y - playerCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < hitRadius && dist < closestDist) {
        closest = username;
        closestDist = dist;
      }
    }

    this.hoveredPlayer = closest;
    this.input.hoveredPlayer = closest;

    // Update cursor based on hover state
    if (closest && this.video instanceof ExplicitVideo) {
      if (this.video.canCallPlayer(closest)) {
        this.canvas.style.cursor = "pointer";
      } else {
        this.canvas.style.cursor = "not-allowed";
      }
    } else {
      this.canvas.style.cursor = "default";
    }
  }

  private render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#080604";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Build depth-sorted render list: players + auras.
    // Every item carries a `rowThreshold` — it won't render until the tile
    // loop reaches that row, preventing later tile rows from painting over it.
    // Connection lines are drawn LAST (on top of everything).
    type RenderItem =
      | {
          kind: "player";
          player: Player;
          isLocal: boolean;
          depth: number;
          rowThreshold: number;
        }
      | { kind: "aura"; player: Player; depth: number; rowThreshold: number };

    const renderItems: RenderItem[] = [];

    for (const player of this.remotePlayers.values()) {
      renderItems.push({
        kind: "player",
        player,
        isLocal: false,
        depth: player.x + player.y,
        rowThreshold: Math.round(player.y),
      });
    }
    if (this.localPlayer) {
      renderItems.push({
        kind: "player",
        player: this.localPlayer,
        isLocal: true,
        depth: this.localPlayer.x + this.localPlayer.y,
        rowThreshold: Math.round(this.localPlayer.y),
      });
    }

    // Add aura for hovered player — but not if already connected to them
    if (this.video instanceof ExplicitVideo && this.hoveredPlayer) {
      const connectedPeers = this.video.getConnectedPeers();
      if (!connectedPeers.has(this.hoveredPlayer)) {
        const player = this.remotePlayers.get(this.hoveredPlayer);
        if (player) {
          renderItems.push({
            kind: "aura",
            player,
            depth: player.x + player.y + 0.01,
            rowThreshold: Math.round(player.y),
          });
        }
      }
    }

    renderItems.sort((a, b) => a.depth - b.depth);

    if (this.tileMap) {
      let itemIdx = 0;
      const totalRows = this.tileMap.rowCount;

      for (let row = 0; row < totalRows; row++) {
        this.tileMap.renderRow(ctx, this.camera, row);

        const maxDepthThisRow = row + this.tileMap.width;
        while (
          itemIdx < renderItems.length &&
          renderItems[itemIdx].depth <= maxDepthThisRow
        ) {
          const item = renderItems[itemIdx];
          if (item.rowThreshold > row) {
            break;
          }
          if (item.kind === "player") {
            this.playerRenderer.render(
              ctx,
              item.player,
              this.camera,
              item.isLocal,
            );
          } else {
            this.aura.render(ctx, item.player, this.camera);
          }
          itemIdx++;
        }
      }

      for (; itemIdx < renderItems.length; itemIdx++) {
        const item = renderItems[itemIdx];
        if (item.kind === "player") {
          this.playerRenderer.render(
            ctx,
            item.player,
            this.camera,
            item.isLocal,
          );
        } else {
          this.aura.render(ctx, item.player, this.camera);
        }
      }
    } else {
      for (const item of renderItems) {
        if (item.kind === "player") {
          this.playerRenderer.render(
            ctx,
            item.player,
            this.camera,
            item.isLocal,
          );
        } else {
          this.aura.render(ctx, item.player, this.camera);
        }
      }
    }

    // Debug overlay
    if ((window as any).__HELLTOWN_DEBUG__?.tileOverlay && this.tileMap) {
      this.tileMap.renderDebugOverlay(ctx, this.camera);
    }

    // Connection lines drawn last (on top of everything)
    if (this.video instanceof ExplicitVideo) {
      // Offset line endpoints: up by 1/8 sprite height, left by 1/32 sprite width
      const spriteSize = ISO_TILE_H * this.camera.zoom * 2.2;
      const yOffset = spriteSize / 8;
      const xOffset = spriteSize / 32;
      for (const { from, to } of this.video.getConnectionLines()) {
        const fromPos = this.getPlayerCanvasPos(from);
        const toPos = this.getPlayerCanvasPos(to);
        if (fromPos && toPos) {
          this.connectionLine.render(
            ctx,
            { x: fromPos.x - xOffset, y: fromPos.y - yOffset },
            { x: toPos.x - xOffset, y: toPos.y - yOffset },
          );
        }
      }
    }
  }

  /** Get a player object by username. */
  private getPlayerByUsername(username: string): Player | undefined {
    if (this.localPlayer?.username === username) return this.localPlayer;
    return this.remotePlayers.get(username);
  }

  /** Get a player's canvas position by username. */
  private getPlayerCanvasPos(
    username: string,
  ): { x: number; y: number } | null {
    let player: Player | undefined;
    if (this.localPlayer?.username === username) {
      player = this.localPlayer;
    } else {
      player = this.remotePlayers.get(username);
    }
    if (!player) return null;

    const [isoX, isoY] = tileToScreen(player.x, player.y);
    return this.camera.screenToCanvas(isoX, isoY);
  }
}

/** Map tileset name to palette JSON asset path. */
const TILESET_PALETTE_MAP: Record<string, string> = {
  church_dungeon: "/game/palette/diablo1_cathedral.json",
  tristram: "/game/palette/diablo1_tristram.json",
};

function palettePathForTileset(tileset: string): string | undefined {
  return TILESET_PALETTE_MAP[tileset];
}
