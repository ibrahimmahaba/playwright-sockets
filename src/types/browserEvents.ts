// ─── Events sent from React → Java backend ───────────────────────────────────

export type ClientToServerEvent =
  | { type: 'mouse-click'; x: number; y: number; button: 'left' | 'right' | 'middle' }
  | { type: 'mouse-move'; x: number; y: number }
  | { type: 'mouse-down'; x: number; y: number; button: 'left' | 'right' | 'middle' }
  | { type: 'mouse-up'; x: number; y: number; button: 'left' | 'right' | 'middle' }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'type-text'; text: string }
  | {
      type: 'key';
      key: string;
      code?: string;
      modifiers?: { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean };
    }
  | { type: 'navigate'; url: string }
  | { type: 'navigate-back' }
  | { type: 'navigate-forward' }
  | { type: 'reload' }
  | { type: 'close-session' };

// ─── Events sent from Java backend → React ───────────────────────────────────

export type ServerToClientEvent =
  | {
      type: 'frame';
      data: string; // base64 JPEG
      metadata: { width: number; height: number; pageScaleFactor?: number };
    }
  | { type: 'loading'; isLoading: boolean }
  | { type: 'navigated'; url: string }
  | { type: 'error'; message: string };

// ─── Session info returned by the REST API ───────────────────────────────────

export interface BrowserSessionInfo {
  sessionId: string;
  webSocketUrl: string;
  viewport: { width: number; height: number };
}

// ─── Connection state ────────────────────────────────────────────────────────

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
