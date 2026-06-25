import { useCallback, useRef, useState } from 'react';
import type { BrowserSessionInfo } from '../types/browserEvents';

const API_BASE = `${process.env.MODULE || '/Monolith'}/api/browser-sessions`;

interface UseBrowserSessionReturn {
  session: BrowserSessionInfo | null;
  error: string | null;
  isCreating: boolean;
  createSession: (url: string, width?: number, height?: number) => Promise<BrowserSessionInfo | null>;
  closeSession: () => Promise<void>;
}

export function useBrowserSession(): UseBrowserSessionReturn {
  const [session, setSession] = useState<BrowserSessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const sessionRef = useRef<BrowserSessionInfo | null>(null);

  const createSession = useCallback(
    async (url: string, width = 1365, height = 768): Promise<BrowserSessionInfo | null> => {
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

        const info: BrowserSessionInfo = await res.json();
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

  return { session, error, isCreating, createSession, closeSession };
}
