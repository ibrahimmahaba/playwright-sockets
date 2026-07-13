// ─── Events sent from React → Java backend ───────────────────────────────────

export type ClientToServerEvent =
  | { type: 'mouse-click'; x: number; y: number; button: 'left' | 'right' | 'middle'; record?: boolean }
  | { type: 'mouse-move'; x: number; y: number; record?: boolean }
  | { type: 'mouse-down'; x: number; y: number; button: 'left' | 'right' | 'middle'; record?: boolean }
  | { type: 'mouse-up'; x: number; y: number; button: 'left' | 'right' | 'middle'; record?: boolean }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number; record?: boolean }
  | { type: 'type-text'; text: string; record?: boolean }
  | {
      type: 'key';
      key: string;
      code?: string;
      modifiers?: { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean };
      record?: boolean;
    }
  | { type: 'navigate'; url: string; record?: boolean }
  | { type: 'navigate-back'; record?: boolean }
  | { type: 'navigate-forward'; record?: boolean }
  | { type: 'reload'; record?: boolean }
  | { type: 'recording-control'; recording: boolean; discard?: boolean }
  | { type: 'recording'; recording: boolean; discard?: boolean }
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

export interface RemoteBrowserSessionInfo {
  sessionId: string;
  webSocketUrl: string;
  viewport: { width: number; height: number };
  currentUrl?: string;
}

export interface SaveRecordingRequest {
  project: string;
  name: string;
  title?: string;
  description?: string;
  intent?: string;
}

export interface SaveRecordingResponse {
  saved: boolean;
  project: string;
  fileName: string;
  filePath: string;
}

export interface RecordingMeta {
  id?: string;
  title?: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
  intent?: string;
}

export interface RecordingProjectOption {
  label: string;
  value: string;
  project_id?: string;
  project_name?: string;
}

export interface LoadedRecordingStep {
  id?: number;
  type?: string;
  shouldRun?: boolean;
  required?: boolean;
  [key: string]: unknown;
}

export interface LoadedRecording {
  version?: string;
  meta?: Record<string, unknown>;
  steps: Record<string, LoadedRecordingStep[] | LoadedRecordingStep[][]>;
}

export interface StepsEnvelope {
  version: string;
  meta?: RecordingMeta;
  steps: Record<string, LoadedRecordingStep[] | LoadedRecordingStep[][]>;
}

export interface RoomRecordingSaveResponse {
  saved: boolean;
  fileName: string;
  roomPath: string;
}

export interface McpToolContext {
  type: string;
  id: string;
  name: string;
  originalName: string;
  message: string;
  roomId: string;
  parameters: Record<string, unknown>;
  toolResponse?: unknown;
  executedParameters?: Record<string, unknown>;
}

export interface ReplayStepResult {
  success: boolean;
  shouldStop?: boolean;
  isNewTab?: boolean;
  newTabId?: string;
  tabTitle?: string;
  error?: string;
}

export interface RemoteBrowserRecordedStep {
  type?: string;
  url?: string;
  selector?: string;
  text?: string;
  role?: string;
  coordinates?: { x: number; y: number };
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
  timestamp?: number;
}

// ─── Connection state ────────────────────────────────────────────────────────

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
