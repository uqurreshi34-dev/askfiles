type Listener = () => void;

let _syncing = false;
const listeners: Listener[] = [];

export function setCloudSyncing(val: boolean) {
  _syncing = val;
  listeners.forEach(l => l());
}

export function isCloudSyncing() {
  return _syncing;
}

export function addCloudSyncListener(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}
