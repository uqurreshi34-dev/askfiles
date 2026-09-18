import React, { useState } from 'react';
import { Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import RNFS from 'react-native-fs';
import { createDirectory, moveFileStream } from 'file-reader';
import { scanFile } from '@/modules/share-module';
import { syncPathReferences } from '@/hooks/usePathSync';
import { toPath } from '@/utils/files';
import {
  organiseFolderWithJarvis,
  JarvisFolderItem,
  JarvisOrganisationPlan,
} from '@/modules/jarvis';
import { recordOrganisation, undoOrganisation, UndoMove, clearOrganisation } from '@/modules/organiseUndo';
import { useTheme } from '@/hooks/useTheme';
import { Cancellable } from '@shopify/flash-list';

export type JarvisOrganiseItem = JarvisFolderItem & {
  uri: string;
  date?: number;
};

type Props = {
  currentPath: string;
  items: JarvisOrganiseItem[];
  disabled?: boolean;
  onComplete: () => void;
};

const MOVE_CONCURRENCY = 4;
let pathSyncQueue = Promise.resolve();

function basePath(path: string) {
  return toPath(path).replace(/\/$/, '');
}

function destinationPath(currentPath: string, folder: string, name: string) {
  return `${basePath(currentPath)}/${folder}/${name}`;
}

function buildSummary(plan: JarvisOrganisationPlan) {
  const counts = new Map<string, number>();
  for (const move of plan.moves) {
    counts.set(move.destination, (counts.get(move.destination) || 0) + 1);
  }

  const parts = Array.from(counts.entries())
    .map(([folder, count]) => `${count} into ${folder}`)
    .join('; ');

  return parts || plan.summary || 'No changes proposed.';
}

function queuePathSync(oldPath: string, newPath: string, newName: string) {
  const task = pathSyncQueue.then(() =>
    syncPathReferences(oldPath, newPath, newName),
  );

  pathSyncQueue = task.catch(() => undefined);

  return task;
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency = MOVE_CONCURRENCY,
) {
  if (items.length === 0) return;

  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  async function consume() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) return;

      await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, () => consume()),
  );
}

export default function JarvisOrganiseButton({
  currentPath,
  items,
  disabled = false,
  onComplete,
}: Props) {
  const { colors } = useTheme();
  const [working, setWorking] = useState(false);

  async function executePlan(plan: JarvisOrganisationPlan) {
    setWorking(true);

    let moved = 0;
    let skipped = 0;
    let failed = 0;
    let failedFolders = 0;
    const createdFolders = new Set<string>();
    const sourceByName = new Map(items.map(item => [item.name, item]));
    const existingFolders = new Set(
      items
        .filter(item => item.isDirectory)
        .map(item => item.name),
    );
    const destinations = Array.from(
      new Set(plan.moves.map(move => move.destination)),
    );
    const readyFolders = new Set<string>();
    const undoMoves: UndoMove[] = [];
    const createdFolderPaths: string[] = [];

    try {
      await Promise.all(
        destinations.map(async folder => {
          if (existingFolders.has(folder)) {
            readyFolders.add(folder);
            return;
          }

          const folderPath = `${basePath(currentPath)}/${folder}`;

          try {
            if (await RNFS.exists(folderPath)) {
              readyFolders.add(folder);
              return;
            }

            await createDirectory(folderPath);
            createdFolders.add(folder);
            createdFolderPaths.push(folderPath);
            readyFolders.add(folder);
          } catch {
            try {
              if (await RNFS.exists(folderPath)) {
                readyFolders.add(folder);
                return;
              }
            } catch {
              // Fall through to the failed-folder count.
            }

            failedFolders++;
          }
        }),
      );

      const moves = plan.moves.filter(move => {
        if (readyFolders.has(move.destination)) return true;
        failed++;
        return false;
      });

      await runWithConcurrency(moves, async move => {
        const source = sourceByName.get(move.file);

        if (!source || source.isDirectory || !readyFolders.has(move.destination)) {
          failed++;
          return;
        }

        const src = toPath(source.uri);
        const dst = destinationPath(currentPath, move.destination, source.name);

        if (src === dst) {
          skipped++;
          return;
        }

        try {
          if (await RNFS.exists(dst)) {
            skipped++;
            return;
          }

          await moveFileStream(source.uri, dst);
        } catch (error) {
          console.warn('[AskFiles] JARVIS move failed:', error);
          failed++;
          return;
        }

        try {
          await queuePathSync(source.uri, `file://${dst}`, source.name);
        } catch (error) {
          console.warn('[AskFiles] JARVIS path-sync failed:', error);
        }

        await scanFile(dst).catch(error => {
          console.warn('[AskFiles] JARVIS media scan failed:', error);
        });

        undoMoves.push({ from: src, to: dst });
        moved++;
      });

      try {
        await onComplete();
      } catch (error) {
        console.warn('[AskFiles] JARVIS refresh failed:', error);
      }

      await Haptics.notificationAsync(
        failed > 0 || failedFolders > 0
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});

      const details = [
        moved > 0 ? `Moved ${moved} item${moved !== 1 ? 's' : ''}.` : 'No items moved.',
        createdFolders.size > 0
          ? `Created ${createdFolders.size} folder${createdFolders.size !== 1 ? 's' : ''}.`
          : '',
        skipped > 0 ? `Skipped ${skipped}.` : '',
        failedFolders > 0
          ? `Could not prepare ${failedFolders} destination folder${failedFolders !== 1 ? 's' : ''}.`
          : '',
        failed > 0 ? `Failed ${failed}.` : '',
      ].filter(Boolean).join(' ');

      const recorded = await recordOrganisation(
        basePath(currentPath),
        undoMoves,
        createdFolderPaths,
      );

      if (!recorded) {
        Alert.alert('JARVIS', details);
        return;
      }

      Alert.alert('JARVIS', details, [
        {
          text: 'Undo',
          onPress: () => {
            void (async () => {
              setWorking(true);

              try {
                const result = await undoOrganisation();

                try {
                  await onComplete();
                } catch (refreshError) {
                  console.warn('[AskFiles] JARVIS refresh failed:', refreshError);
                }
                Alert.alert('JARVIS', result.summary);
              } finally {
                setWorking(false);
              }
            })();
          },
        },
        {
          text: 'Dismiss',
          style: 'cancel',
           // Clears the record rather than just closing. Nothing reads it
          // today except this prompt, but canUndo() is exported and unused
          // -- the moment it feeds a menu item or a startup check, a record
          // left from last week becomes undoable and would move files that
          // were accepted days ago.
          onPress: () => { void clearOrganisation(); },
        },
      ], {cancelable: false});
    } catch (error: any) {
      const message = error?.message || 'I could not finish organising this folder.';
      Alert.alert('JARVIS', message);
    } finally {
      setWorking(false);
    }
  }

  async function handlePress() {
    if (working || disabled) return;

    setWorking(true);

    try {
      const plan = await organiseFolderWithJarvis(currentPath, items);

      if (plan.moves.length === 0) {
        const message = plan.summary || 'This folder is already organised.';
        Alert.alert('JARVIS', message);
        setWorking(false);
        return;
      }

      const summary = buildSummary(plan);
      const newFolders = plan.create_folders.length > 0
        ? `\nCreate: ${plan.create_folders.join(', ')}`
        : '';
      const message = `${summary}.${newFolders}\n\nProceed?`;

      Alert.alert(
        'JARVIS organisation',
        message,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setWorking(false);
            },
          },
          {
            text: 'Organise',
            onPress: () => void executePlan(plan),
          },
        ],
      );
    } catch (error: any) {
      const message = error?.message || 'I could not organise this folder.';
      Alert.alert('JARVIS', message);
      setWorking(false);
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || working}
      activeOpacity={0.7}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {working ? (
        <ActivityIndicator size="small" color={colors.blue} />
      ) : (
        <Ionicons name="sparkles-outline" size={22} color={colors.blue} />
      )}
    </TouchableOpacity>
  );
}
