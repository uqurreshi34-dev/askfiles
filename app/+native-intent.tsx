export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
    try {
      if (initial && path.includes('csv')) {
        return `/csv-reader?incomingUri=${encodeURIComponent(path)}`;
      }
      return path;
    } catch {
      return path;
    }
  }
