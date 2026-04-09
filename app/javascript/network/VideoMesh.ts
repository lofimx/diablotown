/**
 * Pure, immutable state machine for a single video call mesh.
 *
 * Manages call-group membership, hub election, and connection line computation.
 * Has zero I/O, zero DOM, zero WebRTC dependencies — pure data in, pure data out.
 * Each transition method returns a new VideoMesh; the original is never mutated.
 */

export interface ConnectionLineData {
  from: string;
  to: string;
}

export const MAX_CALL_MEMBERS = 5;

export class VideoMesh {
  private readonly _members: ReadonlySet<string>;
  readonly localUsername: string;

  private constructor(localUsername: string, members: Set<string>) {
    this.localUsername = localUsername;
    this._members = members;
  }

  static empty(localUsername: string): VideoMesh {
    return new VideoMesh(localUsername, new Set());
  }

  static fromMembers(localUsername: string, members: Iterable<string>): VideoMesh {
    const set = new Set<string>();
    for (const m of members) {
      if (set.size >= MAX_CALL_MEMBERS) break;
      set.add(m);
    }
    return new VideoMesh(localUsername, set);
  }

  get members(): ReadonlySet<string> {
    return this._members;
  }

  get size(): number {
    return this._members.size;
  }

  /** Hub = alphabetically first member (case-insensitive). */
  hubNode(): string | null {
    if (this._members.size === 0) return null;
    return [...this._members].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    )[0];
  }

  /**
   * Star topology for 2–4 members (hub to each spoke).
   * Pentagram topology for exactly 5: each member connects to the one
   * two positions ahead in alphabetical order (skip-one, wrapping).
   */
  connectionLines(): ConnectionLineData[] {
    if (this._members.size < 2) return [];

    const sorted = [...this._members].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );

    if (sorted.length === MAX_CALL_MEMBERS) {
      return sorted.map((member, i) => ({
        from: member,
        to: sorted[(i + 2) % MAX_CALL_MEMBERS],
      }));
    }

    const hub = sorted[0];
    return sorted.slice(1).map((member) => ({ from: hub, to: member }));
  }

  isInCall(): boolean {
    return this._members.size >= 2;
  }

  isFull(): boolean {
    return this._members.size >= MAX_CALL_MEMBERS;
  }

  hasMember(username: string): boolean {
    return this._members.has(username);
  }

  canCallPlayer(username: string, disabledPlayers: ReadonlySet<string>): boolean {
    return !disabledPlayers.has(username);
  }

  addMember(username: string): VideoMesh {
    if (this._members.has(username) || this.isFull()) return this;
    const next = new Set(this._members);
    next.add(username);
    return new VideoMesh(this.localUsername, next);
  }

  addMembers(usernames: Iterable<string>): VideoMesh {
    const next = new Set(this._members);
    let changed = false;
    for (const u of usernames) {
      if (next.size >= MAX_CALL_MEMBERS) break;
      if (!next.has(u)) {
        next.add(u);
        changed = true;
      }
    }
    return changed ? new VideoMesh(this.localUsername, next) : this;
  }

  removeMember(username: string): VideoMesh {
    if (!this._members.has(username)) return this;
    const next = new Set(this._members);
    next.delete(username);
    return new VideoMesh(this.localUsername, next);
  }

  clear(): VideoMesh {
    if (this._members.size === 0) return this;
    return VideoMesh.empty(this.localUsername);
  }

  equals(other: VideoMesh): boolean {
    if (this.localUsername !== other.localUsername) return false;
    if (this._members.size !== other._members.size) return false;
    for (const m of this._members) {
      if (!other._members.has(m)) return false;
    }
    return true;
  }
}
