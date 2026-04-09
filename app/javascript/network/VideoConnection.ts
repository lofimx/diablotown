import { CableClient } from "./CableClient";
import { PaletteFilter } from "./PaletteFilter";
import { createFlareCanvas, stopFlareCanvas } from "./FlareVideoPlaceholder";

export interface PlayerPosition {
  x: number;
  y: number;
}

/** Shared state for WebRTC peer connections, used by both video modes. */
export interface PeerState {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  videoEl: HTMLVideoElement;
  remoteDescriptionSet: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

/**
 * Common interface for video connection strategies.
 * Both ProximityVideo and ExplicitVideo implement this.
 */
export interface VideoConnection {
  /** Called every frame with current player positions. */
  update(
    localX: number, localY: number,
    players: Map<string, PlayerPosition>,
  ): void;

  /** Returns the set of usernames currently in an active call. */
  getConnectedPeers(): Set<string>;

  /** Returns the hub node username (ExplicitVideo only, null for Proximity). */
  getHubNode(): string | null;

  /** Returns all connection pairs for rendering lines (ExplicitVideo only). */
  getConnectionLines(): Array<{ from: string; to: string }>;

  /** Whether the local player is in an active call. */
  isInCall(): boolean;

  /** End all calls for the local player. */
  endCall(): void;

  /** Initiate a call to a specific player (ExplicitVideo only). */
  initiateCallTo?(username: string): void;

  /** Whether a given player can be called (has video enabled). */
  canCallPlayer(username: string): boolean;

  /** Clean up all resources. */
  destroy(): void;
}

// ─── Shared utilities ───

const FALLBACK_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

export async function fetchIceServers(): Promise<RTCConfiguration> {
  try {
    const res = await fetch("/api/ice_servers");
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return { iceServers: data.ice_servers };
  } catch (e) {
    console.warn("[WebRTC] Failed to fetch ICE servers, using fallback:", e);
    return FALLBACK_ICE_SERVERS;
  }
}

// ─── Zoom cookie helpers ───

function getZoomCookie(username: string): boolean {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)vzoom_${encodeURIComponent(username)}=1`));
  return !!match;
}

function setZoomCookie(username: string, zoomed: boolean) {
  const key = `vzoom_${encodeURIComponent(username)}`;
  if (zoomed) {
    document.cookie = `${key}=1;path=/;max-age=86400`;
  } else {
    document.cookie = `${key}=;path=/;max-age=0`;
  }
}

function applyZoom(videoEl: HTMLVideoElement, zoomed: boolean) {
  videoEl.dataset.zoomed = zoomed ? "1" : "0";
  videoEl.style.width = zoomed ? "320px" : "160px";
  videoEl.style.height = zoomed ? "240px" : "120px";
}

/** Shared base with common WebRTC plumbing. */
export abstract class BaseVideoConnection implements VideoConnection {
  protected cable: CableClient;
  protected localUsername: string;
  protected localStream: MediaStream | null = null;
  protected filteredStream: MediaStream | null = null;
  protected streamPromise: Promise<MediaStream> | null = null;
  protected paletteFilter: PaletteFilter | null = null;
  protected iceConfig: RTCConfiguration | null = null;
  protected iceConfigPromise: Promise<RTCConfiguration> | null = null;
  protected peers = new Map<string, PeerState>();
  protected videoContainer: HTMLElement;
  private localVideoContainer: HTMLElement;
  private localVideoEl: HTMLVideoElement | null = null;
  protected palettePath: string | null = null;
  protected tilesetPath: string | null = null;
  private cameraFailed = false;

  constructor(cable: CableClient, localUsername: string, palettePath?: string, tilesetPath?: string) {
    this.palettePath = palettePath ?? null;
    this.tilesetPath = tilesetPath ?? null;
    this.cable = cable;
    this.localUsername = localUsername;

    // Peer video feeds — bottom-left
    this.videoContainer = document.createElement("div");
    this.videoContainer.id = "video-container";
    this.videoContainer.style.cssText = `
      position: fixed; bottom: 16px; left: 16px;
      display: flex; flex-direction: column; gap: 8px;
      z-index: 200; pointer-events: auto;
    `;
    document.body.appendChild(this.videoContainer);

    // Local video feed — bottom-right
    this.localVideoContainer = document.createElement("div");
    this.localVideoContainer.id = "local-video-container";
    this.localVideoContainer.style.cssText = `
      position: fixed; bottom: 16px; right: 16px;
      display: flex; flex-direction: column; gap: 8px;
      z-index: 200; pointer-events: auto;
    `;
    document.body.appendChild(this.localVideoContainer);

    cable.onMessage((msg) => {
      if (msg.type !== "signal") return;
      if (msg.to !== this.localUsername) return;

      const from = msg.from!;
      console.log(`[WebRTC] signal received: ${msg.signal_type} from=${from} peers=[${[...this.peers.keys()]}]`);
      switch (msg.signal_type) {
        case "offer":
          this.handleOffer(from, msg.payload as RTCSessionDescriptionInit);
          break;
        case "answer":
          this.handleAnswer(from, msg.payload as RTCSessionDescriptionInit);
          break;
        case "ice":
          this.handleIceCandidate(from, msg.payload as RTCIceCandidateInit);
          break;
        case "camera_failed":
          this.handleCameraFailed(from);
          break;
        case "call_ended":
          console.log(`[WebRTC] call_ended from ${from}`);
          this.closePeer(from);
          break;
      }
    });
  }

  abstract update(localX: number, localY: number, players: Map<string, PlayerPosition>): void;
  abstract getConnectedPeers(): Set<string>;
  abstract getHubNode(): string | null;
  abstract getConnectionLines(): Array<{ from: string; to: string }>;
  abstract isInCall(): boolean;
  abstract endCall(): void;
  abstract canCallPlayer(username: string): boolean;

  protected getIceConfig(): Promise<RTCConfiguration> {
    if (!this.iceConfigPromise) {
      this.iceConfigPromise = fetchIceServers().then((config) => {
        this.iceConfig = config;
        return config;
      });
    }
    return this.iceConfigPromise;
  }

  protected getLocalStream(): Promise<MediaStream> {
    if (!this.streamPromise) {
      this.streamPromise = this.initLocalStream();
    }
    return this.streamPromise;
  }

  private async initLocalStream(): Promise<MediaStream> {
    const settings = window.__HELLTOWN_SETTINGS__;
    const constraints: MediaStreamConstraints = {};
    if (settings.videoEnabled) {
      constraints.video = { width: 160, height: 120, frameRate: 15 };
    }
    if (settings.micEnabled) {
      constraints.audio = true;
    }
    // Need at least one track
    if (!constraints.video && !constraints.audio) {
      constraints.audio = true;
    }

    try {
      this.localStream = await this.acquireMedia(constraints);
      console.log("[WebRTC] getUserMedia OK, tracks:", this.localStream.getTracks().map(t => `${t.kind}:${t.label}`));
    } catch (e) {
      console.error("[WebRTC] Could not acquire any media stream:", e);
      this.localStream = new MediaStream();
    }

    // Check if video was requested but not obtained (camera busy/failed)
    const hasVideo = this.localStream.getVideoTracks().length > 0;
    if (!hasVideo && constraints.video) {
      console.warn("[WebRTC] No video track acquired — camera failed");
      this.showLocalFlare();
      // Notify all connected peers (may be empty if called before peer setup)
      for (const peerUsername of this.peers.keys()) {
        this.cable.sendSignal(peerUsername, "camera_failed", {});
      }
      // Also flag so we can notify peers added after stream init
      this.cameraFailed = true;
    }

    if (this.palettePath && constraints.video) {
      try {
        this.paletteFilter = new PaletteFilter();
        await this.paletteFilter.loadPalette(this.palettePath);
        if (this.tilesetPath) {
          await this.paletteFilter.loadBloodTexture(this.tilesetPath);
        }
        this.filteredStream = this.paletteFilter.apply(this.localStream);
      } catch (e) {
        console.warn("[WebRTC] Palette filter failed, using raw stream:", e);
        this.filteredStream = this.localStream;
      }
    } else {
      this.filteredStream = this.localStream;
    }

    // Show local video feed (unless we already showed a flare)
    if (!this.cameraFailed) {
      this.showLocalVideo(this.filteredStream);
    }

    return this.filteredStream;
  }

  /** Display the local video feed in the bottom-right container. */
  private showLocalVideo(stream: MediaStream) {
    if (this.localVideoEl) return;

    const videoEl = document.createElement("video");
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true; // mute local playback to avoid echo
    videoEl.srcObject = stream;
    videoEl.style.cssText = `
      width: 160px; height: 120px;
      border: 2px solid #6b4c2a;
      background: #000;
      border-radius: 4px;
      image-rendering: pixelated;
      cursor: pointer;
      transform: scaleX(-1);
    `;

    const zoomed = getZoomCookie(this.localUsername);
    applyZoom(videoEl, zoomed);

    videoEl.addEventListener("click", () => {
      const isZoomed = videoEl.dataset.zoomed === "1";
      const newZoomed = !isZoomed;
      applyZoom(videoEl, newZoomed);
      setZoomCookie(this.localUsername, newZoomed);
    });

    const label = document.createElement("div");
    label.className = "peer-label";
    label.textContent = this.localUsername;

    const wrapper = document.createElement("div");
    wrapper.dataset.peer = this.localUsername;
    wrapper.appendChild(videoEl);
    wrapper.appendChild(label);
    this.localVideoContainer.appendChild(wrapper);

    this.localVideoEl = videoEl;
  }

  /** Show an animated red flare in place of the local video when camera fails. */
  private showLocalFlare() {
    if (this.localVideoEl) return;
    const flare = createFlareCanvas(160, 120);
    flare.style.border = "2px solid #6b4c2a";
    flare.style.borderRadius = "4px";
    flare.style.cursor = "default";

    const label = document.createElement("div");
    label.className = "peer-label";
    label.textContent = this.localUsername;

    const wrapper = document.createElement("div");
    wrapper.dataset.peer = this.localUsername;
    wrapper.appendChild(flare);
    wrapper.appendChild(label);
    this.localVideoContainer.appendChild(wrapper);
  }

  /**
   * Acquire media with fallback: if both audio+video fails (device busy),
   * retry with audio-only, then video-only.
   */
  private async acquireMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn("[WebRTC] getUserMedia failed with full constraints, trying fallback:", e);
    }

    // Fallback: try audio-only if video was requested
    if (constraints.video && constraints.audio) {
      try {
        console.log("[WebRTC] Retrying with audio-only");
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e2) {
        console.warn("[WebRTC] Audio-only also failed:", e2);
      }
    }

    // Fallback: try video-only if audio was requested
    if (constraints.video) {
      try {
        console.log("[WebRTC] Retrying with video-only");
        return await navigator.mediaDevices.getUserMedia({ video: constraints.video });
      } catch (e3) {
        console.warn("[WebRTC] Video-only also failed:", e3);
      }
    }

    throw new Error("Could not acquire any media stream");
  }

  protected async doInitiateCall(username: string) {
    console.log(`[WebRTC] doInitiateCall(${username}) start, peers=[${[...this.peers.keys()]}]`);
    try {
      const iceConfig = await this.getIceConfig();
      console.log(`[WebRTC] doInitiateCall(${username}) creating peer connection`);
      const peer = this.createPeerConnection(username, iceConfig);
      console.log(`[WebRTC] doInitiateCall(${username}) getting local stream, pc.signalingState=${peer.pc.signalingState}`);
      const stream = await this.getLocalStream();
      console.log(`[WebRTC] doInitiateCall(${username}) got stream, pc.signalingState=${peer.pc.signalingState}, peers=[${[...this.peers.keys()]}]`);

      // Check if our peer was replaced while we were awaiting the stream
      const currentPeer = this.peers.get(username);
      if (currentPeer !== peer) {
        console.warn(`[WebRTC] doInitiateCall(${username}) peer was replaced during await, aborting`);
        return;
      }

      for (const track of stream.getTracks()) {
        peer.pc.addTrack(track, stream);
      }

      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.cable.sendSignal(username, "offer", offer);
      console.log(`[WebRTC] doInitiateCall(${username}) offer sent`);

      if (this.cameraFailed) {
        this.cable.sendSignal(username, "camera_failed", {});
      }
    } catch (e) {
      console.error("[WebRTC] Failed to initiate call to", username, e);
      this.closePeer(username);
    }
  }

  protected async handleOffer(from: string, offer: RTCSessionDescriptionInit) {
    console.log(`[WebRTC] handleOffer(${from}) start, peers=[${[...this.peers.keys()]}]`);
    if (!this.shouldAcceptCall(from)) {
      console.log(`[WebRTC] handleOffer(${from}) rejected — media disabled`);
      return;
    }

    try {
      const iceConfig = await this.getIceConfig();
      console.log(`[WebRTC] handleOffer(${from}) creating peer connection`);
      const peer = this.createPeerConnection(from, iceConfig);
      console.log(`[WebRTC] handleOffer(${from}) getting local stream`);
      const stream = await this.getLocalStream();
      console.log(`[WebRTC] handleOffer(${from}) got stream, pc.signalingState=${peer.pc.signalingState}, peers=[${[...this.peers.keys()]}]`);

      // Check if our peer was replaced while we were awaiting the stream
      const currentPeer = this.peers.get(from);
      if (currentPeer !== peer) {
        console.warn(`[WebRTC] handleOffer(${from}) peer was replaced during await, aborting`);
        return;
      }

      for (const track of stream.getTracks()) {
        peer.pc.addTrack(track, stream);
      }

      await peer.pc.setRemoteDescription(offer);
      peer.remoteDescriptionSet = true;
      await this.drainPendingCandidates(peer);

      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.cable.sendSignal(from, "answer", answer);
      console.log(`[WebRTC] handleOffer(${from}) answer sent`);

      if (this.cameraFailed) {
        this.cable.sendSignal(from, "camera_failed", {});
      }

      this.onCallAccepted(from);
    } catch (e) {
      console.error("[WebRTC] Failed to handle offer from", from, e);
      this.closePeer(from);
    }
  }

  /** Subclasses override to control whether incoming calls are accepted. */
  protected shouldAcceptCall(_from: string): boolean {
    const settings = window.__HELLTOWN_SETTINGS__;
    return settings.micEnabled || settings.videoEnabled;
  }

  /** Called after accepting an incoming call. */
  protected onCallAccepted(_from: string): void {}

  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit) {
    const peer = this.peers.get(from);
    if (peer) {
      await peer.pc.setRemoteDescription(answer);
      peer.remoteDescriptionSet = true;
      await this.drainPendingCandidates(peer);
    }
  }

  private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(from);
    if (!peer) return;

    if (peer.remoteDescriptionSet) {
      await peer.pc.addIceCandidate(candidate);
    } else {
      peer.pendingCandidates.push(candidate);
    }
  }

  /** Remote peer's camera failed — replace their video element with a red flare. */
  private handleCameraFailed(from: string) {
    const wrapper = this.videoContainer.querySelector(`[data-peer="${from}"]`);
    if (!wrapper) return;
    const videoEl = wrapper.querySelector("video");
    if (videoEl) {
      const flare = createFlareCanvas(160, 120);
      flare.style.border = "2px solid #6b4c2a";
      flare.style.borderRadius = "4px";
      wrapper.replaceChild(flare, videoEl);
    }
  }

  private async drainPendingCandidates(peer: PeerState) {
    for (const candidate of peer.pendingCandidates) {
      await peer.pc.addIceCandidate(candidate);
    }
    peer.pendingCandidates = [];
  }

  protected createPeerConnection(username: string, iceConfig: RTCConfiguration): PeerState {
    console.log(`[WebRTC] createPeerConnection(${username}), existing=${this.peers.has(username)}, peers=[${[...this.peers.keys()]}]`);
    this.closePeer(username, false);

    const pc = new RTCPeerConnection(iceConfig);

    const videoEl = document.createElement("video");
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = false;
    videoEl.style.cssText = `
      width: 160px; height: 120px;
      border: 2px solid #6b4c2a;
      background: #000;
      border-radius: 4px;
      image-rendering: pixelated;
      cursor: pointer;
    `;

    // Restore zoom from cookie
    const zoomed = getZoomCookie(username);
    applyZoom(videoEl, zoomed);

    videoEl.addEventListener("click", () => {
      const isZoomed = videoEl.dataset.zoomed === "1";
      const newZoomed = !isZoomed;
      applyZoom(videoEl, newZoomed);
      setZoomCookie(username, newZoomed);
    });

    const label = document.createElement("div");
    label.className = "peer-label";
    label.textContent = username;

    const wrapper = document.createElement("div");
    wrapper.dataset.peer = username;
    wrapper.appendChild(videoEl);
    wrapper.appendChild(label);
    this.videoContainer.appendChild(wrapper);

    const peer: PeerState = {
      pc,
      stream: null,
      videoEl,
      remoteDescriptionSet: false,
      pendingCandidates: [],
    };
    this.peers.set(username, peer);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.cable.sendSignal(username, "ice", event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      videoEl.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        this.closePeer(username);
      }
    };

    return peer;
  }

  /**
   * Close a peer connection and remove its video widget.
   * @param cleanupLocal - if true and this was the last peer, also tear down the local video/stream.
   *   Pass false when replacing a peer (e.g., in createPeerConnection) to avoid nuking shared state.
   */
  protected closePeer(username: string, cleanupLocal = true) {
    console.log(`[WebRTC] closePeer(${username}, cleanupLocal=${cleanupLocal}), hasPeer=${this.peers.has(username)}, peers=[${[...this.peers.keys()]}]`);
    const peer = this.peers.get(username);
    if (peer) {
      peer.pc.close();
      this.peers.delete(username);
    }
    const wrapper = this.videoContainer.querySelector(`[data-peer="${username}"]`);
    if (wrapper) {
      const flare = wrapper.querySelector("canvas");
      if (flare) stopFlareCanvas(flare as HTMLCanvasElement);
      wrapper.remove();
    }

    if (cleanupLocal) {
      // Hide local video when no peers remain
      if (this.peers.size === 0) {
        this.removeLocalVideo();
      }
      // Notify subclass only for real disconnections, not peer replacements
      this.onPeerClosed(username);
    }
  }

  /** Override in subclasses to react to peer removal (e.g., update call group). */
  protected onPeerClosed(_username: string): void {}

  private removeLocalVideo() {
    if (this.localVideoEl) {
      this.localVideoEl = null;
    }
    // Stop any flare animations in the local container
    const flare = this.localVideoContainer.querySelector("canvas");
    if (flare) stopFlareCanvas(flare as HTMLCanvasElement);
    this.localVideoContainer.innerHTML = "";
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.filteredStream) {
      this.filteredStream = null;
    }
    if (this.paletteFilter) {
      this.paletteFilter.destroy();
      this.paletteFilter = null;
    }
    this.streamPromise = null;
    this.cameraFailed = false;
  }

  destroy() {
    for (const username of this.peers.keys()) {
      this.closePeer(username);
    }
    if (this.paletteFilter) {
      this.paletteFilter.destroy();
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    this.videoContainer.remove();
    this.localVideoContainer.remove();
  }
}
