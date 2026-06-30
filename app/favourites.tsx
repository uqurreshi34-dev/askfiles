import React, { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { removeFavourite, cleanupBrokenFavourites, FavouriteItem, useFavourites } from '@/hooks/useFavourites';
import { useTheme } from '@/hooks/useTheme';
import FileListViewer from '@/components/FileListViewer';

export default function FavouritesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { favourites } = useFavourites();

  useFocusEffect(
    useCallback(() => {
      cleanupBrokenFavourites();
    }, [])
  );

  return (
    <FileListViewer<FavouriteItem>
      title="Favourites"
      files={favourites}
      emptyIcon="heart-outline"
      emptyTitle="No favourites yet"
      emptySub='Long press any file and tap "Add to Favourites"'
      countLabel={count => `${count} favourite${count !== 1 ? 's' : ''}`}
      removeAction={{
        icon: 'heart-dislike-outline',
        label: 'Remove from Favourites',
        color: colors.deleteRed,
        confirmTitle: 'Remove from Favourites',
        confirmMessage: (item) => `Remove "${item.name}"?`,
        onConfirm: async (item) => {
          await removeFavourite(item.uri);
        },
      }}
      onBack={() => router.back()}
    />
  );
}
