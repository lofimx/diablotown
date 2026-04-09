/**
 * Manages a collection of VideoMesh instances: one local mesh (the user's
 * active call group) and zero or more external meshes (other groups observed
 * via call_lines broadcasts).
 *
 * "Tell, don't ask" API: callers tell the set what happened (members joined,
 * external lines arrived) and the set maintains consistent internal state.
 * External lines that overlap with local members are automatically pruned.
 */

import { VideoMesh, ConnectionLineData } from "./VideoMesh";

export type { ConnectionLineData } from "./VideoMesh";

export class VideoMeshSet {
  private _local: VideoMesh;
  private _externalLines = new Map<string, ConnectionLineData[]>();
  private _disabledPlayers = new Set<string>();

  constructor(localUsername: string) {
    this._local = VideoMesh.empty(localUsername);
  }

  get local(): VideoMesh {
    return this._local;
  }

  get members(): ReadonlySet<string> {
    return this._local.members;
  }

  // ─── Tell: local mesh transitions ───

  addMembers(usernames: Iterable<string>): void {
    this._local = this._local.addMembers(usernames);
    this.pruneExternalLines();
  }

  removeMember(username: string): void {
    this._local = this._local.removeMember(username);
  }

  clearLocal(): void {
    this._local = this._local.clear();
  }

  // ─── Tell: external line updates ───

  receiveExternalLines(broadcaster: string, lines: ConnectionLineData[]): void {
    const involvesLocal = lines.some(
      (l) => this._local.hasMember(l.from) || this._local.hasMember(l.to),
    );
    if (involvesLocal) return;

    if (lines.length === 0) {
      this._externalLines.delete(broadcaster);
    } else {
      this._externalLines.set(broadcaster, lines);
    }
  }

  // ─── Tell: disabled players ───

  setDisabledPlayers(disabled: Set<string>): void {
    this._disabledPlayers = new Set(disabled);
  }

  // ─── Query ───

  hubNode(): string | null {
    return this._local.hubNode();
  }

  isInCall(): boolean {
    return this._local.isInCall();
  }

  hasMember(username: string): boolean {
    return this._local.hasMember(username);
  }

  canCallPlayer(username: string): boolean {
    return this._local.canCallPlayer(username, this._disabledPlayers);
  }

  /** Lines for the local mesh only (used for broadcasting). */
  connectionLines(): ConnectionLineData[] {
    return this._local.connectionLines();
  }

  /** All lines for rendering: local mesh + all external groups. */
  allConnectionLines(): ConnectionLineData[] {
    const result = [...this._local.connectionLines()];
    for (const lines of this._externalLines.values()) {
      result.push(...lines);
    }
    return result;
  }

  // ─── Internal ───

  private pruneExternalLines(): void {
    for (const [broadcaster, lines] of this._externalLines) {
      const involvesLocal = lines.some(
        (l) => this._local.hasMember(l.from) || this._local.hasMember(l.to),
      );
      if (involvesLocal) {
        this._externalLines.delete(broadcaster);
      }
    }
  }
}
