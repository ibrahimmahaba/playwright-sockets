import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Typography,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DoneIcon from '@mui/icons-material/Done';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useInsight } from '@semoss/sdk-react';
import { BrowserToolbar } from './components/BrowserToolbar';
import { BrowserViewer } from './components/BrowserViewer';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useRemoteBrowserSession } from './hooks/useRemoteBrowserSession';
import { useBrowserSocket } from './hooks/useBrowserSocket';
import type {
  ClientToServerEvent,
  LoadedRecording,
  LoadedRecordingStep,
  RemoteBrowserRecordedStep,
} from './types/browserEvents';

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
    listRecordingFiles,
    loadRecording,
    replaySingleStep,
    getRecordedSteps,
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
  const [playbackProject, setPlaybackProject] = useState<{ label: string; value: string } | null>(null);
  const [recordingFiles, setRecordingFiles] = useState<string[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  const [loadedRecording, setLoadedRecording] = useState<LoadedRecording | null>(null);
  const [runningStepId, setRunningStepId] = useState<number | null>(null);
  const [executedStepIds, setExecutedStepIds] = useState<Set<number>>(() => new Set());
  const [editedTypeValues, setEditedTypeValues] = useState<Record<number, string>>({});
  const [recordedSteps, setRecordedSteps] = useState<RemoteBrowserRecordedStep[]>([]);
  const [isLoadingPlaybackProjects, setIsLoadingPlaybackProjects] = useState(false);
  const [isLoadingRecordingFiles, setIsLoadingRecordingFiles] = useState(false);
  const [isLoadingRecording, setIsLoadingRecording] = useState(false);
  const [isRunningRecording, setIsRunningRecording] = useState(false);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);
  const [playbackControlsOpen, setPlaybackControlsOpen] = useState(true);
  const [loadedRecordingOpen, setLoadedRecordingOpen] = useState(false);
  const [recordedStepsOpen, setRecordedStepsOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [valueRequiredStepId, setValueRequiredStepId] = useState<number | null>(null);
  const autoStartedRef = useRef(false);
  const pauseRequestedRef = useRef(false);

  const flattenedSteps = useMemo((): Array<{ tabId: string; step: LoadedRecordingStep; index: number }> => {
    if (!loadedRecording?.steps) return [];
    const rows: Array<{ tabId: string; step: LoadedRecordingStep; index: number }> = [];
    Object.entries(loadedRecording.steps).forEach(([tabId, tabSteps]) => {
      const maybeNested = tabSteps as Array<LoadedRecordingStep | LoadedRecordingStep[]>;
      const flat = maybeNested.flatMap((item) => (Array.isArray(item) ? item : [item]));
      flat.forEach((step, index) => rows.push({ tabId, step, index }));
    });
    return rows;
  }, [loadedRecording]);

  const loadedStepCount = useMemo(() => {
    return flattenedSteps.length;
  }, [flattenedSteps.length]);

  const typeSteps = useMemo(
    () => flattenedSteps.filter(({ step }) => step.type === 'TYPE' && typeof step.id === 'number'),
    [flattenedSteps],
  );

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
    if (autoStartedRef.current || session || isCreating) return;
    autoStartedRef.current = true;
    createSession('', 1365, 768, true).then((info) => {
      if (!info) {
        autoStartedRef.current = false;
        return;
      }
      setCurrentUrl(info.currentUrl || 'https://example.com');
      setLatestFrame(null);
      setIsRecording(false);
    });
  }, [createSession, isCreating, session]);

  const loadPlaywrightProjects = useCallback(() => {
    let cancelled = false;
    if (!insightId) {
      setSnackError('Insight ID is required to load recording projects');
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingPlaybackProjects(true);
    listRecordingProjects(insightId).then((projects) => {
      if (cancelled) return;
      const options = projects.map((project) => ({
        label: project.label || project.project_name || project.value,
        value: project.value || project.project_id || '',
      })).filter((project) => project.value);
      setRecordingProjects(options);
      setSaveProject((current) => current ?? options[0] ?? null);
      setPlaybackProject((current) => current ?? options[0] ?? null);
    }).finally(() => {
      if (!cancelled) setIsLoadingPlaybackProjects(false);
    });

    return () => {
      cancelled = true;
    };
  }, [insightId, listRecordingProjects]);

  useEffect(() => {
    const cleanup = loadPlaywrightProjects();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [loadPlaywrightProjects]);

  useEffect(() => {
    if (!saveDialogOpen || recordingProjects.length > 0) return;
    const cleanup = loadPlaywrightProjects();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [loadPlaywrightProjects, recordingProjects.length, saveDialogOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoadedRecording(null);
    setSelectedRecording(null);
    if (!insightId || !playbackProject?.value) {
      setRecordingFiles([]);
      return;
    }

    setIsLoadingRecordingFiles(true);
    listRecordingFiles(insightId, playbackProject.value).then((files) => {
      if (cancelled) return;
      setRecordingFiles(files);
      setSelectedRecording(files[0] ?? null);
    }).finally(() => {
      if (!cancelled) setIsLoadingRecordingFiles(false);
    });

    return () => {
      cancelled = true;
    };
  }, [insightId, listRecordingFiles, playbackProject]);

  useEffect(() => {
    if (!isRecording || !session) {
      setRecordedSteps([]);
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      const steps = await getRecordedSteps();
      if (!cancelled) {
        setRecordedSteps(steps);
      }
    };

    refresh();
    const id = window.setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [getRecordedSteps, isRecording, session]);

  const requestPlaybackPause = useCallback((reason = 'Playback paused') => {
    if (!isRunningRecording) return;
    pauseRequestedRef.current = true;
    setIsPlaybackPaused(true);
    setSnackMessage(reason);
  }, [isRunningRecording]);

  // ─── Toolbar handlers ───────────────────────────────────────────────────
  const handleStart = useCallback(
    async (url: string) => {
      const info = await createSession(url);
      if (info) {
        setCurrentUrl(info.currentUrl || url);
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

  const handleLoadRecording = useCallback(async () => {
    if (!insightId || !playbackProject || !selectedRecording) {
      setSnackError('Select a project and recording first');
      return;
    }
    if (!session) {
      setSnackError('Start a remote browser session before loading a recording');
      return;
    }

    setIsLoadingRecording(true);
    const loaded = await loadRecording(insightId, playbackProject.value, selectedRecording);
    setIsLoadingRecording(false);
    if (loaded) {
      setLoadedRecording(loaded);
      setExecutedStepIds(new Set());
      setRunningStepId(null);
      setIsPlaybackPaused(false);
      setValueRequiredStepId(null);
      pauseRequestedRef.current = false;
      const initialValues: Record<number, string> = {};
      Object.values(loaded.steps).forEach((tabSteps) => {
        const maybeNested = tabSteps as Array<LoadedRecordingStep | LoadedRecordingStep[]>;
        maybeNested.flatMap((item) => (Array.isArray(item) ? item : [item])).forEach((step) => {
          if (step.type === 'TYPE' && typeof step.id === 'number' && typeof step.text === 'string') {
            initialValues[step.id] = step.text;
          }
        });
      });
      setEditedTypeValues(initialValues);
      setLoadedRecordingOpen(true);
      setSnackMessage(`Loaded ${selectedRecording}`);
    }
  }, [insightId, loadRecording, playbackProject, selectedRecording, session]);

  const handleRunStep = useCallback(
    async (tabId: string, step: LoadedRecordingStep) => {
      if (!insightId || !playbackProject || !selectedRecording || typeof step.id !== 'number') {
        setSnackError('Cannot run this step');
        return false;
      }

      if (step.type === 'TYPE') {
        const typeValue = editedTypeValues[step.id] ?? (typeof step.text === 'string' ? step.text : '');
        if (!typeValue.trim()) {
          setValueRequiredStepId(step.id);
          setEditingStepId(step.id);
          setLoadedRecordingOpen(true);
          setPlaybackControlsOpen(true);
          setIsPlaybackPaused(true);
          pauseRequestedRef.current = true;
          setSnackError(`Enter a value for step ${step.id} before continuing`);
          return false;
        }
      }

      setValueRequiredStepId(null);
      setRunningStepId(step.id);
      const paramValues =
        step.type === 'TYPE' && typeof step.label === 'string'
          ? { [step.label]: editedTypeValues[step.id] ?? (typeof step.text === 'string' ? step.text : '') }
          : undefined;
      const result = await replaySingleStep(
        insightId,
        playbackProject.value,
        selectedRecording,
        step.id,
        tabId,
        paramValues,
      );
      setRunningStepId(null);
      if (!result.success) {
        setSnackError(result.error || `Failed running step ${step.id}`);
        return false;
      }
      setExecutedStepIds((prev) => new Set(prev).add(step.id as number));
      if (result.shouldStop) {
        setSnackMessage(`Playback paused at step ${step.id}`);
        return false;
      }
      if (pauseRequestedRef.current) {
        setSnackMessage(`Playback paused after step ${step.id}`);
        return false;
      }
      return true;
    },
    [editedTypeValues, insightId, playbackProject, replaySingleStep, selectedRecording],
  );

  const handleRunLoadedRecording = useCallback(async () => {
    if (!insightId || !playbackProject || !selectedRecording || !loadedRecording) {
      setSnackError('Load a recording before running it');
      return;
    }

    setIsRunningRecording(true);
    setIsPlaybackPaused(false);
    setValueRequiredStepId(null);
    pauseRequestedRef.current = false;
    try {
      for (const { tabId, step } of flattenedSteps) {
        if (step.shouldRun === false || typeof step.id !== 'number') {
          continue;
        }
        if (executedStepIds.has(step.id)) {
          continue;
        }
        const shouldContinue = await handleRunStep(tabId, step);
        if (!shouldContinue) {
          return;
        }
      }
      setSnackMessage(`Finished playback: ${selectedRecording}`);
      setIsPlaybackPaused(false);
    } finally {
      setIsRunningRecording(false);
    }
  }, [executedStepIds, flattenedSteps, handleRunStep, insightId, loadedRecording, playbackProject, selectedRecording]);

  const remoteWidth = session?.viewport.width ?? 1365;
  const remoteHeight = session?.viewport.height ?? 768;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      {/* Toolbar row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.5,
          py: 0.25,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 38,
        }}
      >
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
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant={playbackControlsOpen || loadedRecordingOpen ? 'contained' : 'outlined'}
          startIcon={playbackControlsOpen || loadedRecordingOpen ? <ExpandMoreIcon /> : <ChevronRightIcon />}
          onClick={() => {
            setPlaybackControlsOpen((open) => !open);
            if (loadedRecording) setLoadedRecordingOpen(true);
          }}
          sx={{ whiteSpace: 'nowrap', minWidth: 0, px: 1 }}
        >
          Replay
        </Button>
        <Button
          size="small"
          variant={recordedStepsOpen ? 'contained' : 'outlined'}
          startIcon={<FiberManualRecordIcon color={isRecording ? 'error' : 'inherit'} />}
          disabled={!isRecording && recordedSteps.length === 0}
          onClick={() => setRecordedStepsOpen((open) => !open)}
          sx={{ whiteSpace: 'nowrap', minWidth: 0, px: 1 }}
        >
          Recorded {recordedSteps.length ? `(${recordedSteps.length})` : ''}
        </Button>
        {isPlaybackPaused && <Chip size="small" color="warning" label="Paused" />}
        {isRunningRecording && <Chip size="small" color="primary" label={`Step ${runningStepId ?? ''}`} />}
      </Box>

      {/* Session creation error banner */}
      {sessionError && (
        <Alert severity="error" sx={{ mx: 0.5, mt: 0.5, py: 0 }}>
          {sessionError}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Browser canvas */}
        <BrowserViewer
          connectionState={connectionState}
          remoteWidth={remoteWidth}
          remoteHeight={remoteHeight}
          latestFrame={latestFrame}
          sendEvent={sendEvent as (e: ClientToServerEvent) => void}
          onUserInput={() => requestPlaybackPause('Playback will pause after your interaction')}
        />

        <Box
          sx={{
            width: playbackControlsOpen || loadedRecordingOpen || recordedStepsOpen ? 340 : 0,
            borderLeft: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            transition: 'width 160ms ease',
          }}
        >
          <Box sx={{ overflow: 'auto', minHeight: 0 }}>
            <Box
              sx={{
                px: 0.75,
                py: 0.4,
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <IconButton size="small" onClick={() => setPlaybackControlsOpen((open) => !open)} sx={{ p: 0.25 }}>
                {playbackControlsOpen ? <ExpandMoreIcon /> : <ChevronRightIcon />}
              </IconButton>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                Replay controls
              </Typography>
              {isPlaybackPaused && <Chip size="small" color="warning" label="Paused" />}
              {isRunningRecording && <Chip size="small" color="primary" label="Running" />}
            </Box>
            <Collapse in={playbackControlsOpen}>
              <Stack spacing={0.75} sx={{ p: 0.75 }}>
                <Autocomplete
                  size="small"
                  options={recordingProjects}
                  value={playbackProject}
                  onChange={(_, value) => setPlaybackProject(value)}
                  loading={isLoadingPlaybackProjects}
                  getOptionLabel={(option) => option.label}
                  isOptionEqualToValue={(option, value) => option.value === value.value}
                  renderInput={(params) => <TextField {...params} label="Project" />}
                  slotProps={{
                    paper: { sx: { fontSize: 13 } },
                  }}
                />
                <Autocomplete
                  size="small"
                  options={recordingFiles}
                  value={selectedRecording}
                  onChange={(_, value) => {
                    setSelectedRecording(value);
                    setLoadedRecording(null);
                    setLoadedRecordingOpen(false);
                    setEditingStepId(null);
                  }}
                  loading={isLoadingRecordingFiles}
                  getOptionLabel={(option) => option}
                  renderInput={(params) => <TextField {...params} label="Recording file" />}
                  noOptionsText={playbackProject ? 'No recordings found' : 'Select a project first'}
                />
                <Stack direction="row" spacing={0.75}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!session || !selectedRecording || isLoadingRecording || isRunningRecording}
                    onClick={handleLoadRecording}
                    startIcon={isLoadingRecording ? <CircularProgress size={14} /> : <FolderOpenIcon />}
                    fullWidth
                  >
                    Load
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!loadedRecording || isRunningRecording}
                    onClick={handleRunLoadedRecording}
                    startIcon={isRunningRecording ? <CircularProgress size={14} /> : <PlayArrowIcon />}
                    fullWidth
                  >
                    {isPlaybackPaused ? 'Resume' : loadedRecording ? `Run ${loadedStepCount}` : 'Run'}
                  </Button>
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    disabled={!isRunningRecording}
                    onClick={() => requestPlaybackPause('Playback pause requested')}
                    startIcon={<PauseIcon />}
                  >
                    Pause
                  </Button>
                </Stack>
              </Stack>
            </Collapse>

            <Divider />
            <Box
              sx={{
                px: 0.75,
                py: 0.4,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                borderBottom: loadedRecordingOpen ? '1px solid' : 0,
                borderColor: 'divider',
              }}
            >
              <IconButton size="small" disabled={!loadedRecording} onClick={() => setLoadedRecordingOpen((open) => !open)} sx={{ p: 0.25 }}>
                {loadedRecordingOpen ? <ExpandMoreIcon /> : <ChevronRightIcon />}
              </IconButton>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2">Loaded recording</Typography>
                <Typography variant="caption" color="text.secondary">
                  {loadedRecording ? selectedRecording : 'Load a recording to inspect and replay steps'}
                </Typography>
              </Box>
              {loadedRecording && <Chip size="small" label={`${loadedStepCount} steps`} />}
              {typeSteps.length > 0 && <Chip size="small" label={`${typeSteps.length} inputs`} />}
            </Box>
            <Collapse in={loadedRecordingOpen}>
              <List dense disablePadding>
                {flattenedSteps.length === 0 ? (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Load a recording to see its steps here.
                    </Typography>
                  </Box>
                ) : (
                  flattenedSteps.map(({ tabId, step, index }) => {
                    const stepId = typeof step.id === 'number' ? step.id : undefined;
                    const isRunning = runningStepId === stepId;
                    const isDone = stepId !== undefined && executedStepIds.has(stepId);
                    const disabled = isRunningRecording || step.shouldRun === false || stepId === undefined;
                    const isType = step.type === 'TYPE' && stepId !== undefined;
                    const displayValue = stepId !== undefined ? editedTypeValues[stepId] ?? step.text ?? '' : step.text ?? '';
                    const isEditing = isType && editingStepId === stepId;
                    const needsValue = isType && valueRequiredStepId === stepId;

                    return (
                      <Box
                        key={`${tabId}-${stepId ?? index}`}
                        sx={{
                          borderBottom: '1px solid',
                          borderColor: needsValue ? 'warning.main' : 'divider',
                          bgcolor: needsValue ? 'rgba(237, 108, 2, 0.08)' : 'transparent',
                        }}
                      >
                        <ListItemButton
                          disabled={disabled}
                          selected={isRunning}
                          onClick={() => handleRunStep(tabId, step)}
                          sx={{ alignItems: 'flex-start', py: 0.5, px: 1, pr: isType ? 0.25 : 1 }}
                        >
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  #{stepId ?? index + 1} {step.type || 'STEP'}
                                </Typography>
                                {isRunning && <CircularProgress size={12} />}
                                {isDone && <Chip size="small" color="success" label="done" />}
                                {step.shouldRun === false && <Chip size="small" label="skipped" />}
                                {needsValue && <Chip size="small" color="warning" label="value required" />}
                              </Stack>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary" component="span">
                                {tabId}
                                {typeof step.label === 'string' && step.label ? ` · ${step.label}` : ''}
                                {typeof displayValue === 'string' && displayValue ? ` · "${displayValue}"` : ''}
                              </Typography>
                            }
                          />
                          {isType && (
                            <Tooltip title="Edit typed value">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={isRunningRecording}
                                  sx={{ p: 0.5 }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setEditingStepId((current) => (current === stepId ? null : stepId));
                                  }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </ListItemButton>
                        {isEditing && stepId !== undefined && (
                          <Box
                            sx={{ px: 1, pb: 0.75 }}
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            <TextField
                              size="small"
                              fullWidth
                              autoFocus={needsValue}
                              label={typeof step.label === 'string' && step.label ? step.label : `Step ${stepId} value`}
                              type={step.isPassword === true ? 'password' : 'text'}
                              value={editedTypeValues[stepId] ?? ''}
                              error={needsValue}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setEditedTypeValues((prev) => ({ ...prev, [stepId]: nextValue }));
                                if (nextValue.trim() && valueRequiredStepId === stepId) {
                                  setValueRequiredStepId(null);
                                  setIsPlaybackPaused(false);
                                  pauseRequestedRef.current = false;
                                }
                              }}
                              helperText={
                                needsValue
                                  ? 'Enter a value, then click Run/Resume to continue.'
                                  : typeof step.description === 'string' && step.description
                                    ? step.description
                                    : 'This value is used when replaying this TYPE step.'
                              }
                              InputProps={{
                                endAdornment: (
                                  <Stack direction="row" spacing={0.25}>
                                    <IconButton size="small" onClick={() => setEditingStepId(null)}>
                                      <DoneIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        setEditedTypeValues((prev) => ({ ...prev, [stepId]: typeof step.text === 'string' ? step.text : '' }));
                                        setEditingStepId(null);
                                      }}
                                    >
                                      <CloseIcon fontSize="small" />
                                    </IconButton>
                                  </Stack>
                                ),
                              }}
                            />
                          </Box>
                        )}
                      </Box>
                    );
                  })
                )}
              </List>
            </Collapse>

            <Divider />
            <Box
              sx={{
                px: 0.75,
                py: 0.4,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                borderBottom: recordedStepsOpen ? '1px solid' : 0,
                borderColor: 'divider',
              }}
            >
              <IconButton
                size="small"
                disabled={!isRecording && recordedSteps.length === 0}
                onClick={() => setRecordedStepsOpen((open) => !open)}
                sx={{ p: 0.25 }}
              >
                {recordedStepsOpen ? <ExpandMoreIcon /> : <ChevronRightIcon />}
              </IconButton>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2">Recorded steps</Typography>
                <Typography variant="caption" color="text.secondary">
                  Current unsaved recording window
                </Typography>
              </Box>
              <Chip size="small" label={`${recordedSteps.length}`} />
              <Button size="small" disabled={!isRecording} onClick={handleOpenSaveRecording}>
                Save
              </Button>
            </Box>
            <Collapse in={recordedStepsOpen}>
              <List dense disablePadding>
                {recordedSteps.length === 0 ? (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      {isRecording ? 'Interact with the browser to see recorded steps.' : 'Start recording to preview captured steps.'}
                    </Typography>
                  </Box>
                ) : (
                  recordedSteps.map((step, index) => (
                    <ListItemButton key={`${step.timestamp ?? index}-${index}`} disabled sx={{ py: 0.5, px: 1 }}>
                      <ListItemText
                        primary={
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            #{index + 1} {step.type || 'STEP'}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary" component="span">
                            {step.selector ? `${step.role || 'selector'}: ${step.selector}` : ''}
                            {step.text ? ` · "${step.text}"` : ''}
                            {step.coordinates ? ` · (${Math.round(step.coordinates.x)}, ${Math.round(step.coordinates.y)})` : ''}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  ))
                )}
              </List>
            </Collapse>
          </Box>
        </Box>
      </Box>

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
