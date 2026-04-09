import { CableClient } from "./CableClient";
import { BaseVideoConnection, PlayerPosition } from "./VideoConnection";
import { VideoMeshSet } from "./VideoMeshSet";

/**
 * Explicit video connection mode: users click on other players to initiate calls.
 *
 * Call-group state (membership, hub election, connection lines, external lines)
 * is managed by a VideoMeshSet. This class handles I/O: WebRTC peer connections,
 * Action Cable signaling, and DOM video elements.
 */
export class ExplicitVideo extends BaseVideoConnection {
  private meshes: VideoMeshSet;

  constructor(cable: CableClient, localUsername: string, palettePath?: string, tilesetPath?: string) {
    super(cable, localUsername, palettePath, tilesetPath);
    this.meshes = new VideoMeshSet(localUsername);

    cable.onMessage((msg) => {
      if (msg.type === "signal" && msg.signal_type === "call_group" && msg.to === this.localUsername) {
        const payload = msg.payload as { members: string[] };
        const sender = msg.from!;
        console.log(`[ExplicitVideo] call_group from=${sender} members=[${payload.members}] currentPeers=[${[...this.peers.keys()]}]`);

        // What the sender already knows: themselves, the members they listed, and us
        const senderKnows = new Set([sender, ...payload.members, this.localUsername]);

        this.meshes.addMembers([this.localUsername, ...payload.members]);

        // If our group now has members the sender didn't know about, we're
        // merging two call groups — relay the full group to all members so
        // they converge on the same membership and establish peer connections.
        const hasUnknownMembers = [...this.meshes.members].some(m => !senderKnows.has(m));
        if (hasUnknownMembers) {
          console.log(`[ExplicitVideo] merge detected, relaying full group to all members`);
          const fullMembers = [...this.meshes.members];
          for (const member of fullMembers) {
            if (member !== this.localUsername) {
              this.cable.sendSignal(member, "call_group", {
                members: fullMembers.filter(m => m !== member),
              });
            }
          }
        }

        for (const member of payload.members) {
          if (member !== this.localUsername && member !== sender && !this.peers.has(member)) {
            console.log(`[ExplicitVideo] call_group → doInitiateCall(${member})`);
            this.doInitiateCall(member);
          }
        }

        this.onGroupChanged();
      }

      if (msg.type === "call_lines" && msg.username !== this.localUsername) {
        const lines = (msg.lines ?? []) as Array<{ from: string; to: string }>;
        this.meshes.receiveExternalLines(msg.username!, lines);
      }

      // Re-broadcast lines when a new player joins so they can see existing calls
      if (msg.type === "player_joined" && this.meshes.hubNode() === this.localUsername) {
        this.broadcastLines();
      }
    });
  }

  getHubNode(): string | null {
    return this.meshes.hubNode();
  }

  setDisabledPlayers(disabled: Set<string>) {
    this.meshes.setDisabledPlayers(disabled);
  }

  update(_localX: number, _localY: number, _players: Map<string, PlayerPosition>) {}

  private onGroupChanged() {
    if (this.meshes.hubNode() === this.localUsername) {
      this.broadcastLines();
    }
  }

  private broadcastLines() {
    const lines = this.meshes.connectionLines();
    console.log(`[ExplicitVideo] broadcastLines hub=${this.meshes.hubNode()} lines=${JSON.stringify(lines)}`);
    this.cable.sendCallLines(lines);
  }

  initiateCallTo(username: string) {
    if (!this.canCallPlayer(username)) return;
    if (this.peers.has(username)) return;

    const settings = window.__HELLTOWN_SETTINGS__;
    if (!settings.micEnabled && !settings.videoEnabled) return;

    this.meshes.addMembers([this.localUsername, username]);

    // Notify the new member about all existing members
    this.cable.sendSignal(username, "call_group", {
      members: [...this.meshes.members].filter(m => m !== username),
    });

    // Notify all EXISTING peers about the updated group
    const fullMembers = [...this.meshes.members];
    for (const existingPeer of this.peers.keys()) {
      this.cable.sendSignal(existingPeer, "call_group", {
        members: fullMembers.filter(m => m !== existingPeer),
      });
    }

    this.doInitiateCall(username);
    this.onGroupChanged();
  }

  protected shouldAcceptCall(_from: string): boolean {
    const settings = window.__HELLTOWN_SETTINGS__;
    return settings.micEnabled || settings.videoEnabled;
  }

  protected onCallAccepted(from: string): void {
    this.meshes.addMembers([this.localUsername, from]);
    console.log(`[ExplicitVideo] onCallAccepted(${from}) hub=${this.meshes.hubNode()} group=[${[...this.meshes.members]}]`);
    this.onGroupChanged();
  }

  protected onPeerClosed(username: string): void {
    if (!this.meshes.hasMember(username)) return;

    this.meshes.removeMember(username);
    console.log(`[ExplicitVideo] onPeerClosed(${username}) remaining group=[${[...this.meshes.members]}] hub=${this.meshes.hubNode()}`);

    if (this.meshes.local.size > 1) {
      this.onGroupChanged();
    }

    if (this.peers.size === 0) {
      this.meshes.clearLocal();
      this.cable.sendCallLines([]);
    }
  }

  getConnectedPeers(): Set<string> {
    return new Set(this.peers.keys());
  }

  getConnectionLines(): Array<{ from: string; to: string }> {
    return this.meshes.allConnectionLines();
  }

  isInCall(): boolean {
    return this.peers.size > 0;
  }

  endCall(): void {
    for (const peerUsername of this.peers.keys()) {
      this.cable.sendSignal(peerUsername, "call_ended", {});
    }

    for (const username of [...this.peers.keys()]) {
      this.closePeer(username);
    }

    this.cable.sendCallLines([]);
    this.meshes.clearLocal();
  }

  canCallPlayer(username: string): boolean {
    return this.meshes.canCallPlayer(username);
  }
}
