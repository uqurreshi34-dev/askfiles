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

import { getContentMimeType } from '@/modules/csv-reader';

export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  console.log('redirectSystemPath called:', path, initial);
  try {
    // For content:// URIs — ask Android what mime type this actually is
    if (path.includes('content://')) {
      const mime = getContentMimeType(path);
      console.log('mime type resolved:', mime);
      if (mime?.includes('pdf')) {
        return `/pdf-viewer?incomingUri=${encodeURIComponent(path)}`;
      }
      // Default to csv-reader for text/csv and anything else
      return `/csv-reader?incomingUri=${encodeURIComponent(path)}`;
    }
    // For URIs with extensions
    if (path.toLowerCase().includes('.pdf')) {
      return `/pdf-viewer?incomingUri=${encodeURIComponent(path)}`;
    }
    if (path.toLowerCase().includes('.csv') || path.includes('text/csv') || path.includes('FileProvider')) {
      return `/csv-reader?incomingUri=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    return path;
  }
}
