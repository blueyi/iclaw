import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { wsManager } from "@/lib/websocket";

interface WebSocketContextValue {
  isConnected: boolean;
  connectionState: "disconnected" | "connecting" | "connected";
  agentStatus: AgentStatus;
  subscribe: typeof wsManager.subscribe;
}

interface AgentStatus {
  state: "idle" | "thinking" | "executing" | "waiting" | "listening";
  detail?: string;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  connectionState: "disconnected",
  agentStatus: { state: "idle" },
  subscribe: wsManager.subscribe.bind(wsManager),
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ state: "idle" });

  useEffect(() => {
    wsManager.connect();

    const unsubState = wsManager.onStateChange((state) => {
      setConnectionState(state as any);
      setIsConnected(state === "connected");
    });

    const unsubStatus = wsManager.subscribe("status-change", (data) => {
      setAgentStatus(data);
    });

    return () => {
      unsubState();
      unsubStatus();
      wsManager.disconnect();
    };
  }, []);

  const subscribe = useCallback(
    (event: any, handler: any) => wsManager.subscribe(event, handler),
    []
  );

  return (
    <WebSocketContext.Provider value={{ isConnected, connectionState, agentStatus, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function useAgentStatus() {
  const { agentStatus } = useContext(WebSocketContext);
  return agentStatus;
}

export function useLiveUpdates(event: string, handler: (data: any) => void) {
  const { subscribe } = useContext(WebSocketContext);
  useEffect(() => {
    const unsub = subscribe(event as any, handler);
    return unsub;
  }, [event, handler, subscribe]);
}
