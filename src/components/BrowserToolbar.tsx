import React, { useState } from 'react';
import Tooltip from '@mui/material/Tooltip';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import type { ConnectionState } from '../types/browserEvents';

interface BrowserToolbarProps {
  currentUrl: string;
  connectionState: ConnectionState;
  isCreating: boolean;
  isLoading: boolean;
  onStart: (url: string) => void;
  onStop: () => void;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  isRecording: boolean;
  isSaving: boolean;
  canSaveRecording: boolean;
  onToggleRecording: () => void;
  onOpenSaveRecording: () => void;
}

const iconButtonClass = 'grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40';

export const BrowserToolbar: React.FC<BrowserToolbarProps> = ({
  currentUrl,
  connectionState,
  isCreating,
  isLoading,
  onStart,
  onStop,
  onNavigate,
  onBack,
  onForward,
  onReload,
  isRecording,
  isSaving,
  canSaveRecording,
  onToggleRecording,
  onOpenSaveRecording,
}) => {
  const [urlInput, setUrlInput] = useState('https://github.com');
  const isActive = connectionState === 'connected' || connectionState === 'connecting';

  const submit = () => {
    const target = urlInput.trim();
    if (!target) return;
    if (isActive) onNavigate(target);
    else onStart(target);
  };

  React.useEffect(() => {
    if (currentUrl) setUrlInput(currentUrl);
  }, [currentUrl]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface-raised/70 p-0.5">
        <Tooltip title="Back"><span><button className={iconButtonClass} disabled={!isActive || isLoading} onClick={onBack}><ArrowBackIcon fontSize="small" /></button></span></Tooltip>
        <Tooltip title="Forward"><span><button className={iconButtonClass} disabled={!isActive || isLoading} onClick={onForward}><ArrowForwardIcon fontSize="small" /></button></span></Tooltip>
        <Tooltip title="Reload"><span><button className={iconButtonClass} disabled={!isActive || isLoading} onClick={onReload}><RefreshIcon fontSize="small" /></button></span></Tooltip>
      </div>

      <div className="flex h-9 min-w-[220px] flex-1 items-center rounded-md border border-line bg-canvas px-2 shadow-inner shadow-black/20 focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/15">
        <input
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
          placeholder="https://example.com"
          aria-label="Browser URL"
          className="min-w-0 flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-slate-600"
        />
        <Tooltip title={isActive ? 'Go' : 'Start browser'}>
          <span>
            <button className="grid h-7 w-7 place-items-center rounded bg-accent text-canvas transition-colors hover:bg-accent-strong disabled:opacity-40" disabled={isLoading} onClick={submit}>
              {isCreating ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-canvas border-t-transparent" /> : isActive ? <SendIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </button>
          </span>
        </Tooltip>
      </div>

      {isActive && <Tooltip title="Stop viewer"><button className={`${iconButtonClass} border border-danger/30 text-danger hover:bg-danger/10 hover:text-danger`} onClick={onStop}><StopIcon fontSize="small" /></button></Tooltip>}
      {isLoading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="Browser action in progress" />}

      <div className="mx-1 h-6 w-px bg-line" />
      <Tooltip title={isRecording ? 'Stop recording future interactions' : 'Start recording future interactions'}>
        <span>
          <button
            className={`relative flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold tracking-wide transition-all ${isRecording ? 'border-danger bg-danger text-white shadow-[0_0_18px_rgba(240,82,103,0.34)]' : 'border-line bg-surface-raised text-muted hover:border-danger/50 hover:text-ink'} disabled:cursor-not-allowed disabled:opacity-40`}
            disabled={connectionState !== 'connected'}
            onClick={onToggleRecording}
          >
            {isRecording && <span className="absolute -left-1 -top-1 h-3 w-3 animate-ping rounded-full bg-danger/80" />}
            <span className={`grid h-5 w-5 place-items-center rounded-full ${isRecording ? 'bg-white/20' : 'bg-danger/15 text-danger'}`}><FiberManualRecordIcon sx={{ fontSize: 15 }} /></span>
            <span>{isRecording ? 'RECORDING' : 'Record'}</span>
            {isRecording && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
          </button>
        </span>
      </Tooltip>

      <Tooltip title="Save recording to project recordings folder">
        <span>
          <button className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface-raised px-3 text-xs font-semibold text-ink transition-colors hover:border-accent/50 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40" disabled={!canSaveRecording || isSaving} onClick={onOpenSaveRecording}>
            {isSaving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : <SaveIcon sx={{ fontSize: 16 }} />}
            Save
          </button>
        </span>
      </Tooltip>
    </div>
  );
};
