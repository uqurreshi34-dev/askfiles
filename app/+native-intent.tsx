export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  console.log('redirectSystemPath called:', path, initial);
  try {
    if (path.toLowerCase().includes('.csv') || path.includes('text/csv') || path.includes('FileProvider') || path.includes('content://')) {
      return `/csv-reader?incomingUri=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    return path;
  }
}
