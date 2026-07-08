import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Alert,
  Autocomplete,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
} from '@mui/material';
import { useInsight } from '@semoss/sdk-react';
import { BrowserToolbar } from './components/BrowserToolbar';
import { BrowserViewer } from './components/BrowserViewer';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useRemoteBrowserSession } from './hooks/useRemoteBrowserSession';
import { useBrowserSocket } from './hooks/useBrowserSocket';
import type { ClientToServerEvent } from './types/browserEvents';

export default function App() {
  const { insightId } = useInsight();
  const {
    session,
    error: sessionError,
    isCreating,
    isSaving,
    isLoadingProjects,
    createSession,
    closeSession,
    saveRecording,
    listRecordingProjects,
  } = useRemoteBrowserSession();
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [snackError, setSnackError] = useState<string | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [stopRecordingDialogOpen, setStopRecordingDialogOpen] = useState(false);
  const [saveAfterStop, setSaveAfterStop] = useState(false);
  const [recordingProjects, setRecordingProjects] = useState<Array<{ label: string; value: string }>>([]);
  const [saveProject, setSaveProject] = useState<{ label: string; value: string } | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveIntent, setSaveIntent] = useState('');

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

  const defaultRecordingName = useMemo(() => {
    const title = saveTitle.trim() || 'remote-browser-recording';
    const today = new Date().toISOString().split('T')[0];
    return `${title}-${today}`;
  }, [saveTitle]);

  useEffect(() => {
    if (!saveDialogOpen) return;

    let cancelled = false;
    if (!insightId) {
      setSnackError('Insight ID is required to load recording projects');
      return;
    }

    listRecordingProjects(insightId).then((projects) => {
      if (cancelled) return;
      const options = projects.map((project) => ({
        label: project.label || project.project_name || project.value,
        value: project.value || project.project_id || '',
      })).filter((project) => project.value);
      setRecordingProjects(options);
      setSaveProject((current) => current ?? options[0] ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [insightId, listRecordingProjects, saveDialogOpen]);

  // ─── Toolbar handlers ───────────────────────────────────────────────────
  const handleStart = useCallback(
    async (url: string) => {
      const info = await createSession(url);
      if (info) {
        setCurrentUrl(url);
        setLatestFrame(null);
        setIsRecording(false);
      }
    },
    [createSession],
  );

  const handleStop = useCallback(async () => {
    if (isRecording) {
      sendEvent({ type: 'recording-control', recording: false, discard: true });
    }
    sendEvent({ type: 'close-session' });
    await closeSession();
    setLatestFrame(null);
    setCurrentUrl('');
    setIsRecording(false);
    setSaveDialogOpen(false);
    setStopRecordingDialogOpen(false);
  }, [isRecording, sendEvent, closeSession]);

  const handleNavigate = useCallback(
    (url: string) => {
      sendEvent({ type: 'navigate', url });
    },
    [sendEvent],
  );

  const handleBack = useCallback(() => sendEvent({ type: 'navigate-back' }), [sendEvent]);
  const handleForward = useCallback(() => sendEvent({ type: 'navigate-forward' }), [sendEvent]);
  const handleReload = useCallback(() => sendEvent({ type: 'reload' }), [sendEvent]);

  const handleToggleRecording = useCallback(() => {
    if (!isRecording) {
      sendEvent({ type: 'recording-control', recording: true });
      setIsRecording(true);
      setSnackMessage('Recording started');
      return;
    }
    setStopRecordingDialogOpen(true);
  }, [isRecording, sendEvent]);

  const handleDiscardRecording = useCallback(() => {
    sendEvent({ type: 'recording-control', recording: false, discard: true });
    setIsRecording(false);
    setStopRecordingDialogOpen(false);
    setSaveDialogOpen(false);
    setSaveAfterStop(false);
    setSnackMessage('Recording discarded');
  }, [sendEvent]);

  const handleSaveAndStopRecording = useCallback(() => {
    setSaveAfterStop(true);
    setStopRecordingDialogOpen(false);
    setSaveDialogOpen(true);
  }, []);

  const handleSaveRecording = useCallback(async () => {
    const title = saveTitle.trim();
    if (!saveProject) {
      setSnackError('Project is required to save the recording');
      return;
    }

    const saved = await saveRecording({
      project: saveProject.value,
      name: defaultRecordingName,
      title,
      description: saveDescription.trim(),
      intent: saveIntent.trim(),
    });

    if (saved) {
      setSaveDialogOpen(false);
      if (saveAfterStop) {
        sendEvent({ type: 'recording-control', recording: false, discard: true });
        setIsRecording(false);
        setSaveAfterStop(false);
      }
      setSnackMessage(`Saved recording: ${saved.fileName}`);
    }
  }, [defaultRecordingName, saveAfterStop, saveDescription, saveIntent, saveProject, saveRecording, saveTitle, sendEvent]);

  const handleOpenSaveRecording = useCallback(() => {
    setSaveAfterStop(false);
    setSaveDialogOpen(true);
  }, []);

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
          isRecording={isRecording}
          isSaving={isSaving}
          canSaveRecording={!!session && isRecording}
          onToggleRecording={handleToggleRecording}
          onOpenSaveRecording={handleOpenSaveRecording}
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

      <Dialog open={stopRecordingDialogOpen} onClose={() => setStopRecordingDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Stop recording?</DialogTitle>
        <DialogContent>
          Do you want to save the steps recorded in this recording window, or discard them?
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={handleDiscardRecording}>Discard</Button>
          <Button variant="contained" onClick={handleSaveAndStopRecording}>Save steps</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Save recording</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              options={recordingProjects}
              value={saveProject}
              onChange={(_, value) => setSaveProject(value)}
              loading={isLoadingProjects}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) => option.value === value.value}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Project"
                  required
                  autoFocus
                  helperText="Only Playwright-tagged portal projects are shown."
                />
              )}
            />
            <TextField
              label="Title"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Github login"
            />
            <TextField
              label="File name"
              value={defaultRecordingName}
              disabled
              helperText="Generated from title and today's date."
            />
            <TextField
              label="Description"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              multiline
              minRows={2}
            />
            <TextField
              label="Intent"
              value={saveIntent}
              onChange={(e) => setSaveIntent(e.target.value)}
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveRecording}
            disabled={isSaving || !session || !isRecording || !saveProject}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* WebSocket error toast */}
      <Snackbar
        open={!!snackError}
        autoHideDuration={4000}
        onClose={() => setSnackError(null)}
        message={snackError}
      />
      <Snackbar
        open={!!snackMessage}
        autoHideDuration={3000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
      />
    </Box>
  );
}
