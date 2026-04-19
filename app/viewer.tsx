import { StyleSheet, View, Image, Text, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { getMimeType } from '@/utils/files';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';

const { width, height } = Dimensions.get('window');

export default function ViewerScreen() {
  const { uri, name } = useLocalSearchParams<{ uri: string; name: string }>();
  const router = useRouter();

  async function handleShare() {
    try {
      const cacheDir = FileSystem.Paths.cache.uri.endsWith('/') ? FileSystem.Paths.cache.uri : FileSystem.Paths.cache.uri + '/';
      const isPng = (name as string).toLowerCase().endsWith('.png');
      const cacheName = isPng
        ? (name as string).replace(/\.png$/i, '.jpg')
        : (name as string);
      const cacheUri = cacheDir + cacheName;
      const cacheFile = new FileSystem.File(cacheUri);
  
      if (cacheFile.exists) cacheFile.delete();
  
      if (isPng) {
        const result = await ImageManipulator.manipulate(uri as string)
          .renderAsync()
          .then(img => img.saveAsync({ compress: 0.98, format: SaveFormat.JPEG }));
        const convertedFile = new FileSystem.File(result.uri);
        convertedFile.copy(cacheFile);
      } else {
        const sourceFile = new FileSystem.File(uri as string);
        sourceFile.copy(cacheFile);
      }
  
      await Sharing.shareAsync(cacheUri, {
        dialogTitle: name as string,
        mimeType: isPng ? 'image/jpeg' : getMimeType(name as string),
      });
    } catch (e) {
      console.log('Share error:', e);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <SafeAreaView style={styles.safeArea}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.imageWrap}>
          <Image
            source={{ uri: uri as string }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerName} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
            <Ionicons name="share-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginHorizontal: 8,
  },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  image: {
    width,
    height: height * 0.72,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    gap: 12,
  },
  footerName: {
    flex: 1,
    fontSize: 13,
    color: '#888780',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#185FA5',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
});
