import { getApiUrl } from "@/lib/query-client";

type EventType = "agent-thought" | "status-change" | "metric-update" | "cost-update" | "channel-message" | "node-status";

interface WSMessage {
  type: string;
  data?: any;
  message?: string;
  timestamp: string;
}

type EventHandler = (data: any) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers: Map<EventType, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000;
  private _isConnected = false;
  private _connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  private stateListeners: Set<(state: string) => void> = new Set();

  get isConnected() {
    return this._isConnected;
  }

  get connectionState() {
    return this._connectionState;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setConnectionState("connecting");

    try {
      const apiUrl = getApiUrl();
      const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws";
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.setConnectionState("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          if (msg.type === "heartbeat" || msg.type === "connected") return;
          const handlers = this.handlers.get(msg.type as EventType);
          if (handlers) {
            handlers.forEach((handler) => handler(msg.data || msg));
          }
        } catch (e) {
        }
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        this.setConnectionState("disconnected");
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._isConnected = false;
        this.setConnectionState("disconnected");
      };
    } catch (e) {
      this.setConnectionState("disconnected");
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
    this.setConnectionState("disconnected");
  }

  subscribe(event: EventType, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  onStateChange(listener: (state: string) => void) {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  send(type: string, data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  private setConnectionState(state: "disconnected" | "connecting" | "connected") {
    this._connectionState = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(this.baseDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

export const wsManager = new WebSocketManager();
