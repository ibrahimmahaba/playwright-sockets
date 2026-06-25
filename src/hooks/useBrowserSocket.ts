import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientToServerEvent, ConnectionState, ServerToClientEvent } from '../types/browserEvents';

interface UseBrowserSocketOptions {
  wsUrl: string | null;
  onFrame: (data: string, width: number, height: number) => void;
  onNavigated: (url: string) => void;
  onError: (message: string) => void;
}

interface UseBrowserSocketReturn {
  connectionState: ConnectionState;
  sendEvent: (event: ClientToServerEvent) => void;
}

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || `ws://${window.location.host}/Monolith`;

export function useBrowserSocket({
  wsUrl,
  onFrame,
  onNavigated,
  onError,
}: UseBrowserSocketOptions): UseBrowserSocketReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the full WS URL from the relative path returned by the REST API
  const buildFullWsUrl = useCallback((path: string): string => {
    // If VITE_WS_BASE_URL is defined use it, otherwise derive from current location
    const base = WS_BASE.replace(/\/$/, '');
    return `${base}${path}`;
  }, []);

  useEffect(() => {
    if (!wsUrl) return;

    const fullUrl = buildFullWsUrl(wsUrl);
    setConnectionState('connecting');

    const ws = new WebSocket(fullUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('connected');
    };

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const msg: ServerToClientEvent = JSON.parse(evt.data as string);
        switch (msg.type) {
          case 'frame':
            onFrame(msg.data, msg.metadata.width, msg.metadata.height);
            break;
          case 'navigated':
            onNavigated(msg.url);
            break;
          case 'error':
            onError(msg.message);
            break;
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onclose = () => {
      setConnectionState('closed');
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnectionState('error');
    };

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.close();
    };
  }, [wsUrl, buildFullWsUrl, onFrame, onNavigated, onError]);

  const sendEvent = useCallback((event: ClientToServerEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }, []);

  return { connectionState, sendEvent };
}
