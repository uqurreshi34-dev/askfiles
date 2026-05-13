type ProgressState = { current: number; total: number } | null;
type Listener = () => void;

let _uploadProgress: Record<string, ProgressState> = { google: null, onedrive: null, dropbox: null };
let _restoreProgress: Record<string, ProgressState> = { google: null, onedrive: null, dropbox: null };
const listeners: Listener[] = [];

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
function notify() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    listeners.forEach(l => l());
    notifyTimer = null;
  }, 100);
}

export function setUploadProgress(provider: 'google' | 'onedrive' | 'dropbox', progress: ProgressState) {
  _uploadProgress[provider] = progress;
  notify();
}

export function setRestoreProgress(provider: 'google' | 'onedrive' | 'dropbox', progress: ProgressState) {
  _restoreProgress[provider] = progress;
  notify();
}

export function getUploadProgress(provider: 'google' | 'onedrive' | 'dropbox'): ProgressState {
  return _uploadProgress[provider];
}

export function getRestoreProgress(provider: 'google' | 'onedrive' | 'dropbox'): ProgressState {
  return _restoreProgress[provider];
}

export function addProgressListener(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}
