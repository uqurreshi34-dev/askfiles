import React, { useState, useCallback, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { getPendingTagId } from '@/modules/storage-stats';
import { getTag } from '@/hooks/useTags';
import { getFilesForTag, removeTagFromFile, FileTagEntry, cleanupBrokenFileTags } from '@/hooks/useFileTags';
import { useTheme } from '@/hooks/useTheme';
import FileListViewer from '@/components/FileListViewer';
import { useLanguage } from '@/modules/appLanguage';
import { listsText } from '@/modules/i18n/listsText';

export default function TagFilesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const t = listsText(useLanguage());
  const [tagName, setTagName] = useState('');
  const [files, setFiles] = useState<FileTagEntry[]>([]);
  // Keep tagId stable across renders so onConfirm always removes the right tag
  const tagIdRef = useRef<string>('');

  useFocusEffect(
    useCallback(() => {
      cleanupBrokenFileTags();
    }, [])
  );

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
      title={tagName || t.tagFallback}
      files={files}
      emptyIcon="pricetag-outline"
      emptyTitle={t.tagEmpty}
      emptySub={t.tagEmptySub(tagName || t.tagFallback)}
      countLabel={t.fileCount}
      removeAction={{
        icon: 'pricetag-outline',
        label: t.removeTagLabel(tagName),
        color: colors.deleteRed,
        confirmTitle: t.removeTag,
        confirmMessage: (item) => t.removeTagMsg(tagName, item.name),
        onConfirm: async (item) => {
          await removeTagFromFile(item.uri, tagIdRef.current);
          setFiles(prev => prev.filter(f => f.uri !== item.uri));
        },
      }}
      onBack={() => router.back()}
    />
  );
}
