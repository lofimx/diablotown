import { Camera, screenToTile } from "./Camera";

export type MoveCallback = (targetCol: number, targetRow: number) => void;
export type PlayerClickCallback = (username: string) => void;

export class InputManager {
  private keys = new Set<string>();
  private mouseCanvasX = 0;
  private mouseCanvasY = 0;
  private mouseDown = false;
  private onMove: MoveCallback;
  private onPlayerClick: PlayerClickCallback | null = null;
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  /** The username of the player currently under the cursor (set by Game). */
  hoveredPlayer: string | null = null;

  constructor(canvas: HTMLCanvasElement, camera: Camera, onMove: MoveCallback) {
    this.canvas = canvas;
    this.camera = camera;
    this.onMove = onMove;

    window.addEventListener("keydown", (e) => {
      // Don't capture when typing in inputs
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      this.keys.add(e.key);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key));

    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.updateMouse(e);
        this.handleClick();
      }
    });
    canvas.addEventListener("mouseup", () => { this.mouseDown = false; });
    canvas.addEventListener("mousemove", (e) => { this.updateMouse(e); });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      camera.adjustZoom(e.deltaY > 0 ? -1 : 1);
    }, { passive: false });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setPlayerClickCallback(cb: PlayerClickCallback) {
    this.onPlayerClick = cb;
  }

  private updateMouse(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseCanvasX = e.clientX - rect.left;
    this.mouseCanvasY = e.clientY - rect.top;
  }

  private handleClick() {
    // If hovering over a player, dispatch player click instead of move
    if (this.hoveredPlayer && this.onPlayerClick) {
      this.onPlayerClick(this.hoveredPlayer);
      return;
    }

    const screen = this.camera.canvasToScreen(this.mouseCanvasX, this.mouseCanvasY);
    const [col, row] = screenToTile(screen.x, screen.y);
    this.onMove(Math.round(col), Math.round(row));
  }

  getArrowDirection(): { dx: number; dy: number } | null {
    let dx = 0;
    let dy = 0;

    if (this.keys.has("ArrowUp") || this.keys.has("w")) dy -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("s")) dy += 1;
    if (this.keys.has("ArrowLeft") || this.keys.has("a")) dx -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("d")) dx += 1;

    if (dx === 0 && dy === 0) return null;
    return { dx, dy };
  }

  isAttackPressed(): boolean {
    return this.keys.has("x") || this.keys.has("X");
  }

  isMouseHeld(): boolean {
    // Don't do hold-to-move if hovering over a player
    if (this.hoveredPlayer) return false;
    return this.mouseDown;
  }

  getMouseCanvasPos(): { x: number; y: number } {
    return { x: this.mouseCanvasX, y: this.mouseCanvasY };
  }

  getMouseTile(): { col: number; row: number } {
    const screen = this.camera.canvasToScreen(this.mouseCanvasX, this.mouseCanvasY);
    const [col, row] = screenToTile(screen.x, screen.y);
    return { col: Math.round(col), row: Math.round(row) };
  }
}
