// export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
//   console.log('redirectSystemPath called:', path, initial);
//   try {
//     if (path.toLowerCase().includes('.csv') || path.includes('text/csv') || path.includes('FileProvider') || path.includes('content://')) {
//       return `/csv-reader?incomingUri=${encodeURIComponent(path)}`;
//     }
//     return path;
//   } catch {
//     return path;
//   }
// }

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  console.log('redirectSystemPath called:', path, initial);
  try {
    if (path.toLowerCase().includes('.pdf')) {
      return `/file-intent?uri=${encodeURIComponent(path)}&type=pdf`;
    }
    if (path.toLowerCase().includes('.csv') || path.includes('text/csv')) {
      return `/file-intent?uri=${encodeURIComponent(path)}&type=csv`;
    }
    if (path.includes('content://') || path.includes('FileProvider')) {
      return `/file-intent?uri=${encodeURIComponent(path)}&type=unknown`;
    }
    return path;
  } catch {
    return path;
  }
}
