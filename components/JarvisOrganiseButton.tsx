import React, { useState } from 'react';
import { Alert, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import RNFS from 'react-native-fs';
import { createDirectory, moveFileStream } from 'file-reader';
import { scanFile } from '@/modules/share-module';
import { syncPathReferences } from '@/hooks/usePathSync';
import { toPath } from '@/utils/files';
import { organiseFolderWithJarvis, JarvisFolderItem, JarvisOrganisationPlan } from '@/modules/jarvis';
import { useTheme } from '@/hooks/useTheme';

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

    try {
      const sourceByName = new Map(items.map(item => [item.name, item]));
      const destinations = new Set(plan.moves.map(move => move.destination));

      for (const folder of destinations) {
        const folderPath = `${basePath(currentPath)}/${folder}`;
        if (!(await RNFS.exists(folderPath))) {
          await createDirectory(folderPath);
        }
      }

      for (const move of plan.moves) {
        const source = sourceByName.get(move.file);

        if (!source || source.isDirectory) {
          failed++;
          continue;
        }

        const src = toPath(source.uri);
        const dst = destinationPath(currentPath, move.destination, source.name);

        if (src === dst) {
          skipped++;
          continue;
        }

        if (await RNFS.exists(dst)) {
          skipped++;
          continue;
        }

        try {
          await moveFileStream(source.uri, dst);
          await syncPathReferences(source.uri, `file://${dst}`, source.name);
          await scanFile(dst).catch(() => {});
          moved++;
        } catch {
          failed++;
        }
      }

      await onComplete();
      await Haptics.notificationAsync(
        failed > 0
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      );

      const created = Array.from(destinations).filter(folder =>
        !items.some(item => item.isDirectory && item.name === folder),
      ).length;

      const details = [
        moved > 0 ? `Moved ${moved} item${moved !== 1 ? 's' : ''}.` : 'No items moved.',
        created > 0 ? `Created ${created} folder${created !== 1 ? 's' : ''}.` : '',
        skipped > 0 ? `Skipped ${skipped}.` : '',
        failed > 0 ? `Failed ${failed}.` : '',
      ].filter(Boolean).join(' ');

      Alert.alert('JARVIS', details);
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
        Alert.alert('JARVIS', plan.summary || 'This folder is already organised.');
        return;
      }

      const summary = buildSummary(plan);
      const newFolders = plan.create_folders.length > 0
        ? `\nCreate: ${plan.create_folders.join(', ')}`
        : '';

      Alert.alert(
        'JARVIS organisation',
        `${summary}.${newFolders}\n\nProceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Organise', onPress: () => void executePlan(plan) },
        ],
      );
    } catch (error: any) {
      Alert.alert('JARVIS', error?.message || 'I could not organise this folder.');
    } finally {
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
