export interface CableMessage {
  type: string;
  username?: string;
  x?: number;
  y?: number;
  direction?: string;
  from?: string;
  to?: string;
  video_enabled?: boolean;
  lines?: Array<{ from: string; to: string }>;
  signal_type?: string;
  payload?: unknown;
  message?: string;
  timestamp?: string;
}

export type MessageHandler = (msg: CableMessage) => void;

export class CableClient {
  private socket: WebSocket | null = null;
  private subscription: unknown = null;
  private handlers: MessageHandler[] = [];
  private dmHandlers: MessageHandler[] = [];
  private mapId: number;
  private connected = false;

  constructor(mapId: number) {
    this.mapId = mapId;
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  onDirectMessage(handler: MessageHandler) {
    this.dmHandlers.push(handler);
  }

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/cable`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      // Subscribe to the map channel
      this.socket!.send(JSON.stringify({
        command: "subscribe",
        identifier: JSON.stringify({ channel: "MapChannel", map_id: this.mapId }),
      }));
      // Subscribe to direct messages
      this.socket!.send(JSON.stringify({
        command: "subscribe",
        identifier: JSON.stringify({ channel: "DirectMessageChannel" }),
      }));
      this.connected = true;
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Ignore pings and confirmations
      if (data.type === "ping" || data.type === "welcome" || data.type === "confirm_subscription") {
        return;
      }

      if (data.message) {
        const identifier = data.identifier ? JSON.parse(data.identifier) : null;
        if (identifier?.channel === "DirectMessageChannel") {
          for (const handler of this.dmHandlers) {
            handler(data.message as CableMessage);
          }
        } else {
          for (const handler of this.handlers) {
            handler(data.message as CableMessage);
          }
        }
      }
    };

    this.socket.onclose = () => {
      this.connected = false;
      // Reconnect after delay
      setTimeout(() => this.connect(), 2000);
    };
  }

  send(action: string, data: Record<string, unknown>) {
    if (!this.socket || !this.connected) return;

    this.socket.send(JSON.stringify({
      command: "message",
      identifier: JSON.stringify({ channel: "MapChannel", map_id: this.mapId }),
      data: JSON.stringify({ action, ...data }),
    }));
  }

  sendDirectMessage(to: string, message: string) {
    if (!this.socket || !this.connected) return;

    this.socket.send(JSON.stringify({
      command: "message",
      identifier: JSON.stringify({ channel: "DirectMessageChannel" }),
      data: JSON.stringify({ action: "send_message", to, message }),
    }));
  }

  sendMove(x: number, y: number, direction: string) {
    this.send("move", { x, y, direction });
  }

  sendVideoStatus(videoEnabled: boolean) {
    this.send("video_status", { video_enabled: videoEnabled });
  }

  sendCallLines(lines: Array<{ from: string; to: string }>) {
    this.send("call_lines", { lines });
  }

  sendSignal(to: string, signalType: string, payload: unknown) {
    this.send("signal", { to, signal_type: signalType, payload });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
