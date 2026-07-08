import { useCallback, useRef, useState } from 'react';
import { runPixel } from '@semoss/sdk';
import type {
  RemoteBrowserSessionInfo,
  RecordingProjectOption,
  SaveRecordingRequest,
  SaveRecordingResponse,
} from '../types/browserEvents';

const API_BASE = `${process.env.MODULE || '/Monolith'}/api/browser-sessions`;

interface UseRemoteBrowserSessionReturn {
  session: RemoteBrowserSessionInfo | null;
  error: string | null;
  isCreating: boolean;
  isSaving: boolean;
  isLoadingProjects: boolean;
  createSession: (url: string, width?: number, height?: number) => Promise<RemoteBrowserSessionInfo | null>;
  closeSession: () => Promise<void>;
  saveRecording: (payload: SaveRecordingRequest) => Promise<SaveRecordingResponse | null>;
  listRecordingProjects: (insightId: string) => Promise<RecordingProjectOption[]>;
}

export function useRemoteBrowserSession(): UseRemoteBrowserSessionReturn {
  const [session, setSession] = useState<RemoteBrowserSessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const sessionRef = useRef<RemoteBrowserSessionInfo | null>(null);

  const createSession = useCallback(
    async (url: string, width = 1365, height = 768): Promise<RemoteBrowserSessionInfo | null> => {
      setIsCreating(true);
      setError(null);
      try {
        const res = await fetch(API_BASE, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, viewportWidth: width, viewportHeight: height }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        const info: RemoteBrowserSessionInfo = await res.json();
        setSession(info);
        sessionRef.current = info;
        return info;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to create session';
        setError(msg);
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  const closeSession = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      await fetch(`${API_BASE}/${s.sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      // Best-effort close
    }
    setSession(null);
    sessionRef.current = null;
  }, []);

  const saveRecording = useCallback(async (payload: SaveRecordingRequest): Promise<SaveRecordingResponse | null> => {
    const s = sessionRef.current;
    if (!s) {
      setError('No active recording session to save');
      return null;
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/${s.sessionId}/recording/save`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      return (await res.json()) as SaveRecordingResponse;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save recording';
      setError(msg);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const listRecordingProjects = useCallback(async (insightId: string): Promise<RecordingProjectOption[]> => {
    if (!insightId) {
      setError('Insight ID is required to list recording projects');
      return [];
    }

    setIsLoadingProjects(true);
    setError(null);
    try {
      const pixel = `MyProjects(metaFilters=[{"tag":["PLAYWRIGHT"]}], filterWord=[""], onlyPortals=[true]);`;
      const res = await runPixel(pixel, insightId);
      const output = res.pixelReturn?.[0]?.output;
      if (!Array.isArray(output)) {
        return [];
      }

      return output
        .map((project: { project_display_name?: string; project_name?: string; project_id?: string }) => {
          const value = project.project_id;
          if (!value) {
            return null;
          }
          return {
            label: project.project_display_name || project.project_name || value,
            value,
            project_id: value,
            project_name: project.project_name,
          };
        })
        .filter((project): project is RecordingProjectOption => project !== null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to list recording projects';
      setError(msg);
      return [];
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  return {
    session,
    error,
    isCreating,
    isSaving,
    isLoadingProjects,
    createSession,
    closeSession,
    saveRecording,
    listRecordingProjects,
  };
}
