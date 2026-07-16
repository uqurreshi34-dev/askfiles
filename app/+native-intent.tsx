export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (path.includes('callback')) {
    return path;
  }
  return '/(tabs)';
}
