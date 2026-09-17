/**
 * Plan a folder organisation on the device, with no network and no model.
 *
 * The backend never asked Claude for a list of moves. It asked for compact
 * RULES -- extension rules and name rules -- and expanded those into moves
 * locally, in jarvis_service.expand_plan. Every category we care about is
 * expressible as one of those rules, so the model was being paid to
 * reproduce a lookup table.
 *
 * This is that lookup table, applied on the device. The backend stays wired
 * in as a fallback for folders this cannot plan at all, which in practice
 * means folders full of file types nobody has classified yet.
 *
 * The safety rules are ported literally from expand_plan rather than
 * reinterpreted:
 *
 *   - directories are never moved
 *   - a destination is a plain child folder name: no slash, backslash,
 *     "." or ".."
 *   - a file matched by two different name rules is left where it is
 *   - an unknown extension is left where it is, rather than swept into a
 *     catch-all
 *
 * One deliberate difference from the backend, which needs porting back:
 * an existing child folder is reused case-insensitively. The backend
 * compares destinations to existing folders exactly, so with an "Images"
 * folder already present a plan naming "images" creates a second one.
 */

import type {
    JarvisFolderItem,
    JarvisFolderMove,
    JarvisOrganisationPlan,
  } from '@/modules/jarvis';
  
  const MAX_NAME_LENGTH = 255;
  
  /**
   * Extension to folder. Add a line and the category exists; nothing else
   * needs to change.
   *
   * Anything absent from here is deliberately left in place. A catch-all
   * would sweep up files whose home nobody has decided on, and moving a file
   * you did not expect to move is worse than leaving it.
   */
  const EXTENSION_RULES: Record<string, string> = {
    // Images
    jpg: 'Images', jpeg: 'Images', png: 'Images', gif: 'Images',
    webp: 'Images', bmp: 'Images', heic: 'Images', heif: 'Images',
    tiff: 'Images', tif: 'Images', avif: 'Images', svg: 'Images',
  
    // Spreadsheets
    csv: 'Spreadsheets', tsv: 'Spreadsheets', xls: 'Spreadsheets',
    xlsx: 'Spreadsheets', xlsm: 'Spreadsheets', ods: 'Spreadsheets',
  
    // Documents
    doc: 'Documents', docx: 'Documents', pdf: 'Documents',
    ppt: 'Documents', pptx: 'Documents', odp: 'Documents',
    odt: 'Documents', rtf: 'Documents', txt: 'Documents',
    md: 'Documents', epub: 'Documents',
  
    // Archives
    zip: 'Archives', '7z': 'Archives', rar: 'Archives', tar: 'Archives',
    gz: 'Archives', tgz: 'Archives', bz2: 'Archives', xz: 'Archives',
    zst: 'Archives',
  
    // Video and audio. Not in the original spec -- delete these lines if you
    // would rather they stayed put.
    mp4: 'Videos', mkv: 'Videos', mov: 'Videos', avi: 'Videos',
    webm: 'Videos', m4v: 'Videos', '3gp': 'Videos',
    mp3: 'Music', m4a: 'Music', wav: 'Music', flac: 'Music',
    ogg: 'Music', opus: 'Music', aac: 'Music',
  
    // Everything that is plainly a leftover rather than a document.
    apk: 'Miscellaneous', patch: 'Miscellaneous', bak: 'Miscellaneous',
    diff: 'Miscellaneous', log: 'Miscellaneous', tmp: 'Miscellaneous',
    old: 'Miscellaneous',
  };
  
  /**
   * A word in the filename to a folder, whatever the extension. These beat
   * extension rules, exactly as the backend's prefix rules do.
   *
   * Matched as a WORD, not as a substring. "IMG_scan_01.pdf" matches "scan"
   * and "Scandinavia.pdf" does not, which plain containment gets wrong. The
   * backend only does startsWith, so porting this back means adding a
   * "contains" match type there.
   */
  const NAME_RULES: Record<string, string> = {
    screenshot: 'Screenshots',
    screenshots: 'Screenshots',
    screencap: 'Screenshots',
    scan: 'Scans',
    scanned: 'Scans',
    scans: 'Scans',
  };
  
  /**
   * Folders Android and its apps rely on, where reorganising breaks things
   * outside AskFiles.
   *
   * DCIM and DCIM/Camera are indexed by MediaStore and read by every gallery
   * on the phone; move the files into subfolders and photos vanish from the
   * gallery and from "recent" in other apps. Android/data and Android/obb are
   * app-private and often not writable at all.
   *
   * Matched on the path, so a folder of your own called "scans" inside DCIM
   * is still protected while one on the SD card root is not.
   */
  const PROTECTED_PATHS = [
    '/dcim',
    '/dcim/camera',
    '/android',
    '/android/data',
    '/android/obb',
  ];
  
  function normalisePath(path: string): string {
    return (path || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }
  
  /** True when this folder must be left exactly as it is. */
  export function isProtectedPath(path: string): boolean {
    const normalised = normalisePath(path);
  
    return PROTECTED_PATHS.some(
      protectedPath =>
        normalised.endsWith(protectedPath) ||
        normalised.includes(`${protectedPath}/`),
    );
  }
  
  /** A plain child folder name, or '' when the value cannot be one. */
  function safeName(value: string): string {
    const text = (value || '').trim();
  
    if (!text || text === '.' || text === '..') return '';
    if (text.length > MAX_NAME_LENGTH) return '';
    if (text.includes('/') || text.includes('\\')) return '';
  
    return text;
  }
  
  function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
  
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  }
  
  /** The words in a filename, ignoring its extension and separators. */
  function wordsIn(name: string): string[] {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
  
    return stem
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }
  
  /**
   * Destinations a file's words point at. More than one means the file is
   * ambiguous and is left alone.
   */
  function nameDestinations(name: string): Set<string> {
    const found = new Set<string>();
  
    for (const word of wordsIn(name)) {
      const destination = NAME_RULES[word];
  
      if (destination) found.add(destination);
    }
  
    return found;
  }
  
  function describe(moves: JarvisFolderMove[], created: string[]): string {
    if (moves.length === 0) return 'This folder is already organised.';
  
    const counts = new Map<string, number>();
  
    for (const move of moves) {
      counts.set(move.destination, (counts.get(move.destination) || 0) + 1);
    }
  
    const parts = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([folder, count]) => `${count} to ${folder}`);
  
    const listed =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  
    const newFolders =
      created.length > 0
        ? `, creating ${created.length} folder${created.length === 1 ? '' : 's'}`
        : ', reusing the folders already here';
  
    return `Moving ${moves.length} file${
      moves.length === 1 ? '' : 's'
    }: ${listed}${newFolders}.`;
  }
  
  /**
   * Plan the move locally, or null when nothing here can be classified.
   *
   * null is the signal to fall back to the backend. An empty-but-valid plan
   * is not null: a folder that is already organised has been planned
   * successfully and needs no model.
   */
  export function planLocally(
    currentPath: string,
    items: JarvisFolderItem[],
    existingChildFolders: string[],
  ): JarvisOrganisationPlan | null {
    if (isProtectedPath(currentPath)) {
      return {
        summary:
          'This is a standard Android folder, so I will leave its structure intact.',
        moves: [],
        create_folders: [],
      };
    }
  
    // Existing folders by lowered name, so "Images" is reused rather than
    // "images" being created alongside it.
    const existingByKey = new Map<string, string>();
    const directoryNames = new Set<string>();
    const fileNames = new Set<string>();
  
    for (const folder of existingChildFolders) {
      const name = safeName(folder);
  
      if (name) existingByKey.set(name.toLowerCase(), name);
    }
  
    for (const item of items) {
      const name = (item.name || '').trim();
  
      if (!name) continue;
  
      if (item.isDirectory) {
        directoryNames.add(name);
        existingByKey.set(name.toLowerCase(), name);
      } else {
        fileNames.add(name);
      }
    }
  
    const moves: JarvisFolderMove[] = [];
    let classifiable = 0;
  
    for (const item of items) {
      const name = (item.name || '').trim();
  
      if (!name || item.isDirectory) continue;
  
      // Hidden files are configuration, not clutter. .nomedia in particular
      // changes how Android indexes the whole folder.
      if (name.startsWith('.')) continue;
      if (name.length > MAX_NAME_LENGTH) continue;
  
      const byName = nameDestinations(name);
  
      // Two name rules disagree, so this file is ambiguous. Left in place.
      if (byName.size > 1) continue;
  
      const destination =
        byName.size === 1
          ? [...byName][0]
          : EXTENSION_RULES[extensionOf(name)];
  
      if (!destination) continue;
  
      classifiable += 1;
  
      const resolved =
        existingByKey.get(destination.toLowerCase()) || safeName(destination);
  
      if (!resolved) continue;
  
      // Already where it belongs -- only possible when a folder shares the
      // file's own name, but the backend guards this and so does this.
      if (resolved === name) continue;
  
      moves.push({ file: name, destination: resolved });
    }
  
    if (classifiable === 0 && fileNames.size > 0) {
      // Nothing here is recognisable. Worth a model's opinion.
      return null;
    }
  
    const created: string[] = [];
  
    for (const destination of [...new Set(moves.map(move => move.destination))].sort()) {
      const key = destination.toLowerCase();
  
      if (existingByKey.has(key)) continue;
      if (created.includes(destination)) continue;
      if (fileNames.has(destination)) continue;
      if (directoryNames.has(destination)) continue;
  
      created.push(destination);
    }
  
    return {
      summary: describe(moves, created),
      moves,
      create_folders: created,
    };
  }
