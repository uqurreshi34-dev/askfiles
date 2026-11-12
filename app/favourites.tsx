import React, { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { removeFavourite, cleanupBrokenFavourites, FavouriteItem, useFavourites } from '@/hooks/useFavourites';
import { useTheme } from '@/hooks/useTheme';
import FileListViewer from '@/components/FileListViewer';
import { useLanguage } from '@/modules/appLanguage';
import { listsText } from '@/modules/i18n/listsText';

export default function FavouritesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { favourites } = useFavourites();
  const t = listsText(useLanguage());

  useFocusEffect(
    useCallback(() => {
      cleanupBrokenFavourites();
    }, [])
  );

  return (
    <FileListViewer<FavouriteItem>
      title={t.favTitle}
      files={favourites}
      emptyIcon="heart-outline"
      emptyTitle={t.favEmpty}
      emptySub={t.favEmptySub}
      countLabel={t.favCount}
      removeAction={{
        icon: 'heart-dislike-outline',
        label: t.removeFav,
        color: colors.deleteRed,
        confirmTitle: t.removeFav,
        confirmMessage: (item) => t.removeFavMsg(item.name),
        onConfirm: async (item) => {
          await removeFavourite(item.uri);
        },
      }}
      onBack={() => router.back()}
    />
  );
}
