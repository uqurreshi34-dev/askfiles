export function getMimeType(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
      mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
      mov: 'video/quicktime', webm: 'video/webm',
      mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac',
      flac: 'audio/flac', m4a: 'audio/mp4',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain', csv: 'text/csv',
      zip: 'application/zip', rar: 'application/x-rar-compressed',
      apk: 'application/vnd.android.package-archive',
    };
    return mimeMap[ext ?? ''] ?? '*/*';
  }
  
  export function isImageFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext ?? '');
  }

  export function getFileColor(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'].includes(ext)) return '#185FA5';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext)) return '#993C1D';
    if (ext === 'pdf') return '#D2342B';                          // red
    if (['doc', 'docx'].includes(ext)) return '#2B579A';          // word blue
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '#217346';   // excel green
    if (['ppt', 'pptx'].includes(ext)) return '#C43E1C';          // powerpoint orange
    if (ext === 'txt') return '#5F5E5A';                          // neutral grey
    if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'].includes(ext)) return '#854F0B';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '#3B6D11';
    return '#5F5E5A';
  }

  export function getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'].includes(ext)) return 'image';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext)) return 'videocam';
    if (ext === 'pdf') return 'document-text';
    if (['doc', 'docx'].includes(ext)) return 'document-text';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'document-text';
    if (['ppt', 'pptx'].includes(ext)) return 'document-text';
    if (ext === 'txt') return 'document-text';
    if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'].includes(ext)) return 'musical-notes';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    if (ext === 'apk') return 'logo-android';
    return 'document-outline';
  }

  export function formatSize(bytes: number): string {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  export function formatDate(ms: number): string {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const months = Math.floor(days / 30);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
    return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  export function formatDuration(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  export function toPath(uri: string): string {
    try { return decodeURIComponent(uri.replace('file://', '')); }
    catch { return uri.replace('file://', ''); }
  }
  
  export function getFriendlyPath(
    uri: string,
    volumes: { name: string; path: string; type: string }[] = []
  ): string {
    const sdVolume = volumes.find(v => v.type === 'sdcard' && uri.includes(v.path));
    const raw = sdVolume
      ? uri.replace(`file://${sdVolume.path}/`, `${sdVolume.name}/`).split('/').slice(0, -1).join('/')
      : uri.replace('file:///storage/emulated/0/', '').split('/').slice(0, -1).join('/') || 'Internal Storage';
      const decoded = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
      return decoded.startsWith('/') ? decoded : '/' + decoded;
  }

  export function decodeName(name: string): string {
    try { return decodeURIComponent(name); } catch { return name; }
  }

  // Returns a unique filename against a set of already-claimed names.
// "report.pdf" -> "report (1).pdf" -> "report (2).pdf"
// Dotfiles and extensionless names are handled: ".gitignore" -> ".gitignore (1)"
export function uniqueName(name: string, claimed: Set<string>): string {
  if (!claimed.has(name)) { claimed.add(name); return name; }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 1;
  let candidate = `${base} (${n})${ext}`;
  while (claimed.has(candidate)) {
    n++;
    candidate = `${base} (${n})${ext}`;
  }
  claimed.add(candidate);
  return candidate;
}

export function exifLines(info: {
  dateTaken?: string; camera?: string; iso?: string;
  aperture?: string; shutter?: string;
  latitude?: number; longitude?: number;
  videoDate?: string;
}): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];

  // EXIF dates are "yyyy:MM:dd HH:mm:ss" — colons in the date, not parseable directly
  if (info.dateTaken) {
    const m = info.dateTaken.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
      if (!isNaN(t)) lines.push({ label: 'Date taken', value: formatDate(t) });
    }
  }
  // Video recording date — MediaMetadataRetriever returns "yyyyMMdd'T'HHmmss.SSS'Z'"
  if (info.videoDate) {
    const m = info.videoDate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (m) {
      const year = +m[1];
      // MP4 stores creation time from a 1904 epoch; a missing value renders as
      // 1904 (or thereabouts). Reject anything implausible rather than show it.
      if (year > 1990 && year <= new Date().getFullYear() + 1) {
        const t = Date.UTC(year, +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        if (!isNaN(t)) lines.push({ label: 'Recorded', value: formatDate(t) });
      }
    }
  }
  if (info.camera) lines.push({ label: 'Camera', value: info.camera });
  if (info.iso) lines.push({ label: 'ISO', value: info.iso });
  if (info.aperture) lines.push({ label: 'Aperture', value: `f/${info.aperture}` });
  if (info.shutter) {
    const sec = parseFloat(info.shutter);
    if (!isNaN(sec)) lines.push({
      label: 'Shutter',
      value: sec < 1 ? `1/${Math.round(1 / sec)}s` : `${sec}s`,
    });
  }
  if (info.latitude !== undefined && info.longitude !== undefined) {
    lines.push({ label: 'GPS', value: `${info.latitude.toFixed(5)}, ${info.longitude.toFixed(5)}` });
  }

  return lines;
}
