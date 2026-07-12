export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path.toLowerCase().includes('.pdf')) {
      return `/file-intent?uri=${encodeURIComponent(path)}&type=pdf`;
    }
    if (path.toLowerCase().includes('.csv') || path.includes('text/csv')) {
      return `/file-intent?uri=${encodeURIComponent(path)}&type=csv`;
    }
    if (path.toLowerCase().includes('.txt')) {
      return `/file-intent?uri=${encodeURIComponent(path)}&type=text`;
    }
    return path;
  } catch {
    return path;
  }
}
