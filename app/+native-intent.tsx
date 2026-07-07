export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
    try {
      if (path.toLowerCase().includes('.csv') || path.includes('text/csv') || path.includes('FileProvider')) {
        return `/csv-reader?incomingUri=${encodeURIComponent(path)}`;
      }
      return path;
    } catch {
      return path;
    }
  }
