/**
 * Undo the last organisation, offline.
 *
 * Ported from JARVIS's actions/folder_undo.py, which has been reversing the
 * desktop organiser for months. The rules that matter are the same:
 *
 *   - one transaction is remembered, not a history. "Undo" means the last
 *     thing, and a stack of them invites undoing something you have since
 *     built on.
 *   - moves are reversed in the opposite order to execution, so a file
 *     never lands where a folder is about to be removed.
 *   - a move whose file is no longer where we put it is SKIPPED, not
 *     failed. You may have moved it again yourself, and putting it back
 *     would be the surprising thing.
 *   - a created folder is removed only if it is still empty. Anything you
 *     have added to it since is yours, and the folder stays.
 *
 * The record lives in the app's own private directory, not in the folder
 * that was organised. Writing a dot-file into someone's storage to support
 * an undo they may never press is litter, and app-private storage needs no
 * permission and disappears with the app.
 */

import RNFS from 'react-native-fs';
import { moveFileStream } from 'file-reader';

/** One file that moved, as absolute paths. */
export type UndoMove = {
  from: string;
  to: string;
};

export type UndoRecord = {
  version: 1;
  createdAt: number;
  /** The folder that was organised. */
  base: string;
  moves: UndoMove[];
  /** Absolute paths of folders this organisation created. */
  createdFolders: string[];
};

export type UndoResult = {
  restored: number;
  skipped: number;
  failed: number;
  removedFolders: number;
  summary: string;
};

const RECORD_PATH = `${RNFS.DocumentDirectoryPath}/jarvis-organise-undo.json`;

/**
 * Remember one completed organisation. Replaces any previous record.
 *
 * Returns false when there is nothing worth remembering, so the caller can
 * decide not to offer an undo at all.
 */
export async function recordOrganisation(
  base: string,
  moves: UndoMove[],
  createdFolders: string[],
): Promise<boolean> {
  const safeMoves = (moves || []).filter(
    move => move && move.from && move.to && move.from !== move.to,
  );

  const safeFolders = [...new Set((createdFolders || []).filter(Boolean))];

  if (safeMoves.length === 0 && safeFolders.length === 0) {
    await clearOrganisation();
    return false;
  }

  const record: UndoRecord = {
    version: 1,
    createdAt: Date.now(),
    base,
    moves: safeMoves,
    createdFolders: safeFolders,
  };

  try {
    await RNFS.writeFile(RECORD_PATH, JSON.stringify(record), 'utf8');
    return true;
  } catch (error) {
    console.warn('[AskFiles] could not record undo:', error);
    return false;
  }
}

/** The stored transaction, or null when there is none to reverse. */
export async function loadOrganisation(): Promise<UndoRecord | null> {
  try {
    if (!(await RNFS.exists(RECORD_PATH))) return null;

    const raw = await RNFS.readFile(RECORD_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object') return null;

    const record = parsed as Partial<UndoRecord>;

    if (record.version !== 1) return null;
    if (!Array.isArray(record.moves)) return null;

    return {
      version: 1,
      createdAt: Number(record.createdAt) || 0,
      base: String(record.base || ''),
      moves: record.moves.filter(
        move => move && typeof move.from === 'string' && typeof move.to === 'string',
      ),
      createdFolders: Array.isArray(record.createdFolders)
        ? record.createdFolders.filter(name => typeof name === 'string')
        : [],
    };
  } catch (error) {
    console.warn('[AskFiles] could not read undo record:', error);
    return null;
  }
}

export async function clearOrganisation(): Promise<void> {
  try {
    if (await RNFS.exists(RECORD_PATH)) {
      await RNFS.unlink(RECORD_PATH);
    }
  } catch (error) {
    console.warn('[AskFiles] could not clear undo record:', error);
  }
}

/** True when there is a transaction to reverse. */
export async function canUndo(): Promise<boolean> {
  const record = await loadOrganisation();

  return Boolean(record && (record.moves.length > 0 || record.createdFolders.length > 0));
}

function describe(result: Omit<UndoResult, 'summary'>): string {
  if (result.restored === 0 && result.skipped === 0 && result.failed === 0) {
    return 'There was nothing left to put back.';
  }

  const parts = [
    result.restored > 0
      ? `Put ${result.restored} file${result.restored === 1 ? '' : 's'} back.`
      : 'No files were put back.',
    result.removedFolders > 0
      ? `Removed ${result.removedFolders} empty folder${
          result.removedFolders === 1 ? '' : 's'
        }.`
      : '',
    result.skipped > 0
      ? `Left ${result.skipped} alone, ${
          result.skipped === 1 ? 'it has' : 'they have'
        } moved since.`
      : '',
    result.failed > 0 ? `Could not move ${result.failed} back.` : '',
  ];

  return parts.filter(Boolean).join(' ');
}

/**
 * Reverse the stored organisation.
 *
 * The record is cleared afterwards whatever happened, because a
 * half-applied undo is not something to offer twice -- the second attempt
 * would be reasoning about a folder that no longer matches the record.
 */
export async function undoOrganisation(): Promise<UndoResult> {
  const record = await loadOrganisation();

  if (!record) {
    return {
      restored: 0,
      skipped: 0,
      failed: 0,
      removedFolders: 0,
      summary: 'There is nothing to undo.',
    };
  }

  let restored = 0;
  let skipped = 0;
  let failed = 0;
  let removedFolders = 0;

  // Opposite order to execution, so nothing lands in a folder that is
  // about to be removed.
  for (const move of [...record.moves].reverse()) {
    try {
      if (!(await RNFS.exists(move.to))) {
        // Gone from where we put it: moved again, renamed or deleted since.
        skipped += 1;
        continue;
      }

      if (await RNFS.exists(move.from)) {
        // Something already occupies the original name. Overwriting it
        // would destroy a file this undo never touched.
        skipped += 1;
        continue;
      }

      await moveFileStream(`file://${move.to}`, move.from);
      restored += 1;
    } catch (error) {
      console.warn('[AskFiles] undo move failed:', error);
      failed += 1;
    }
  }

  for (const folder of record.createdFolders) {
    try {
      if (!(await RNFS.exists(folder))) continue;

      const remaining = await RNFS.readDir(folder);

      // Anything still in there was put there by the user, so the folder
      // is theirs now.
      if (remaining.length > 0) continue;

      await RNFS.unlink(folder);
      removedFolders += 1;
    } catch (error) {
      console.warn('[AskFiles] could not remove folder:', error);
    }
  }

  await clearOrganisation();

  const counts = { restored, skipped, failed, removedFolders };

  return { ...counts, summary: describe(counts) };
}
