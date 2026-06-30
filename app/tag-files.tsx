import React, { useState, useCallback, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { getPendingTagId } from '@/modules/storage-stats';
import { getTag } from '@/hooks/useTags';
import { getFilesForTag, removeTagFromFile, FileTagEntry } from '@/hooks/useFileTags';
import { useTheme } from '@/hooks/useTheme';
import FileListViewer from '@/components/FileListViewer';

export default function TagFilesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tagName, setTagName] = useState('Tag');
  const [files, setFiles] = useState<FileTagEntry[]>([]);
  // Keep tagId stable across renders so onConfirm always removes the right tag
  const tagIdRef = useRef<string>('');

  useFocusEffect(
    useCallback(() => {
      const id = getPendingTagId();
      if (!id) { router.back(); return; }
      tagIdRef.current = id;

      // Load tag definition for title/color
      getTag(id).then(tag => {
        if (tag) {
            setTagName(tag.name);
          }
      });

      // Load files carrying this tag
      getFilesForTag(id).then(setFiles);
    }, [])
  );

  return (
    <FileListViewer
      title={tagName}
      files={files}
      emptyIcon="pricetag-outline"
      emptyTitle="No files tagged yet"
      emptySub={`Tag files with "${tagName}" from the file long-press menu in Browse or Categories.`}
      countLabel={count => `${count} file${count !== 1 ? 's' : ''}`}
      removeAction={{
        icon: 'pricetag-outline',
        label: `Remove "${tagName}" tag`,
        color: colors.deleteRed,
        confirmTitle: 'Remove tag',
        confirmMessage: (item) => `Remove the "${tagName}" tag from "${item.name}"?`,
        onConfirm: async (item) => {
          await removeTagFromFile(item.uri, tagIdRef.current);
          setFiles(prev => prev.filter(f => f.uri !== item.uri));
        },
      }}
      onBack={() => router.back()}
    />
  );
}
