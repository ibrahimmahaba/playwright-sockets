import React, { useCallback, useState } from 'react';
import { Box, Alert, Snackbar } from '@mui/material';
import { BrowserToolbar } from './components/BrowserToolbar';
import { BrowserViewer } from './components/BrowserViewer';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useBrowserSession } from './hooks/useBrowserSession';
import { useBrowserSocket } from './hooks/useBrowserSocket';
import type { ClientToServerEvent } from './types/browserEvents';

export default function App() {
  const { session, error: sessionError, isCreating, createSession, closeSession } = useBrowserSession();
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [snackError, setSnackError] = useState<string | null>(null);

  // Frame callback - stable reference so it doesn't re-trigger the socket effect
  const handleFrame = useCallback((data: string, _w: number, _h: number) => {
    setLatestFrame(data);
  }, []);

  const handleNavigated = useCallback((url: string) => {
    setCurrentUrl(url);
  }, []);

  const handleSocketError = useCallback((msg: string) => {
    setSnackError(msg);
  }, []);

  const { connectionState, sendEvent } = useBrowserSocket({
    wsUrl: session?.webSocketUrl ?? null,
    onFrame: handleFrame,
    onNavigated: handleNavigated,
    onError: handleSocketError,
  });

  // ─── Toolbar handlers ───────────────────────────────────────────────────
  const handleStart = useCallback(
    async (url: string) => {
      const info = await createSession(url);
      if (info) {
        setCurrentUrl(url);
        setLatestFrame(null);
      }
    },
    [createSession],
  );

  const handleStop = useCallback(async () => {
    sendEvent({ type: 'close-session' });
    await closeSession();
    setLatestFrame(null);
    setCurrentUrl('');
  }, [sendEvent, closeSession]);

  const handleNavigate = useCallback(
    (url: string) => {
      sendEvent({ type: 'navigate', url });
    },
    [sendEvent],
  );

  const handleBack = useCallback(() => sendEvent({ type: 'navigate-back' }), [sendEvent]);
  const handleForward = useCallback(() => sendEvent({ type: 'navigate-forward' }), [sendEvent]);
  const handleReload = useCallback(() => sendEvent({ type: 'reload' }), [sendEvent]);

  const remoteWidth = session?.viewport.width ?? 1365;
  const remoteHeight = session?.viewport.height ?? 768;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Toolbar row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
        <BrowserToolbar
          currentUrl={currentUrl}
          connectionState={connectionState}
          isCreating={isCreating}
          onStart={handleStart}
          onStop={handleStop}
          onNavigate={handleNavigate}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
        />
        <ConnectionStatus state={connectionState} />
      </Box>

      {/* Session creation error banner */}
      {sessionError && (
        <Alert severity="error" sx={{ mx: 1, mt: 0.5 }}>
          {sessionError}
        </Alert>
      )}

      {/* Browser canvas */}
      <BrowserViewer
        connectionState={connectionState}
        remoteWidth={remoteWidth}
        remoteHeight={remoteHeight}
        latestFrame={latestFrame}
        sendEvent={sendEvent as (e: ClientToServerEvent) => void}
      />

      {/* WebSocket error toast */}
      <Snackbar
        open={!!snackError}
        autoHideDuration={4000}
        onClose={() => setSnackError(null)}
        message={snackError}
      />
    </Box>
  );
}
