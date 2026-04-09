import { CableClient } from "./CableClient";
import { BaseVideoConnection, PlayerPosition } from "./VideoConnection";

const PROXIMITY_THRESHOLD = 5;

export class ProximityVideo extends BaseVideoConnection {
  private proximityActive = new Set<string>();

  constructor(cable: CableClient, localUsername: string, palettePath?: string, tilesetPath?: string) {
    super(cable, localUsername, palettePath, tilesetPath);
  }

  update(localX: number, localY: number, players: Map<string, PlayerPosition>) {
    const nowNearby = new Set<string>();

    for (const [username, pos] of players) {
      if (username === this.localUsername) continue;
      const dx = localX - pos.x;
      const dy = localY - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= PROXIMITY_THRESHOLD) {
        nowNearby.add(username);
      }
    }

    for (const username of nowNearby) {
      if (!this.proximityActive.has(username)) {
        this.proximityActive.add(username);
        if (this.localUsername < username) {
          this.doInitiateCall(username);
        }
      }
    }

    for (const username of this.proximityActive) {
      if (!nowNearby.has(username)) {
        this.proximityActive.delete(username);
        this.closePeer(username);
      }
    }
  }

  protected onCallAccepted(from: string): void {
    this.proximityActive.add(from);
  }

  getConnectedPeers(): Set<string> {
    return new Set(this.peers.keys());
  }

  getHubNode(): string | null {
    return null;
  }

  getConnectionLines(): Array<{ from: string; to: string }> {
    return [];
  }

  isInCall(): boolean {
    return this.peers.size > 0;
  }

  endCall(): void {
    for (const username of [...this.peers.keys()]) {
      this.closePeer(username);
    }
    this.proximityActive.clear();
  }

  canCallPlayer(_username: string): boolean {
    return true; // proximity handles this automatically
  }
}
