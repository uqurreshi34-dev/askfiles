import { StyleSheet, View, Text, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { MediaSlideshowView } from 'media-slideshow';
import { shareFiles } from '@/modules/share-module';
import { addFavourite, removeFavourite, isFavourite } from '@/hooks/useFavourites';
import * as Haptics from 'expo-haptics';

export let slideshowImages: { name: string; uri: string }[] = [];
export function setSlideshowImages(items: { name: string; uri: string }[]) {
  slideshowImages = items;
}

const SPEEDS = [2000, 4000, 7000, 10000];
const SPEED_LABELS: Record<number, string> = { 2000: '2s', 4000: '4s', 7000: '7s', 10000: '10s' };

function toPath(uri: string): string {
  try { return decodeURIComponent(uri.replace('file://', '')); } catch { return uri.replace('file://', ''); }
}

function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function SlideshowScreen() {
  const router = useRouter();

  const [items] = useState(() => {
    const seen = new Set<string>();
    return slideshowImages.filter(it => {
      if (seen.has(it.name)) return false;
      seen.add(it.name);
      return true;
    });
  });

  const [shuffle, setShuffle] = useState(true);
  const [order, setOrder] = useState<number[]>(() => shuffledIndices(items.length));
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4000);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isFav, setIsFav] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentItemIndex = items.length > 0 ? order[pos] : 0;
  const currentItem = items[currentItemIndex];

  useEffect(() => {
    if (items.length === 0) return;
    setOrder(shuffle ? shuffledIndices(items.length) : Array.from({ length: items.length }, (_, i) => i));
    setPos(0);
  }, [shuffle, items.length]);

  const advance = useCallback(() => {
    setPos(prev => {
      const next = prev + 1;
      if (next >= order.length) {
        if (shuffle) setOrder(shuffledIndices(items.length));
        return 0;
      }
      return next;
    });
  }, [order.length, shuffle, items.length]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (playing && !controlsVisible && items.length > 1) {
      timer.current = setTimeout(advance, speed);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, controlsVisible, pos, speed, advance, items.length]);

  useEffect(() => {
    if (currentItem) isFavourite(currentItem.uri).then(setIsFav);
  }, [currentItem?.uri]);

  function onImageTap() {
    setControlsVisible(v => {
      const next = !v;
      if (next) setPlaying(false);
      return next;
    });
  }

  function manualNav(dir: 1 | -1) {
    setPos(prev => {
      let next = prev + dir;
      if (next >= order.length) { if (shuffle) setOrder(shuffledIndices(items.length)); next = 0; }
      if (next < 0) next = order.length - 1;
      return next;
    });
  }

  async function handleShare() {
    if (!currentItem) return;
    try { await shareFiles([toPath(currentItem.uri)], 'image/*'); } catch {}
  }

  async function handleToggleFav() {
    if (!currentItem) return;
    if (isFav) { await removeFavourite(currentItem.uri); setIsFav(false); }
    else { await addFavourite({ name: currentItem.name, uri: currentItem.uri }); setIsFav(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
  }

  function handleInfo() {
    if (!currentItem) return;
    const loc = decodeURIComponent(currentItem.uri.replace('file:///storage/emulated/0/', '/').split('/').slice(0, -1).join('/')) || '/';
    Alert.alert(currentItem.name, `Location: ${loc}`);
  }

  if (items.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={{ color: '#888', marginBottom: 16 }}>No images to show</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.exitBtn}>
          <Text style={{ color: '#fff' }}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <MediaSlideshowView
        uris={items.map(i => i.uri)}
        currentIndex={currentItemIndex}
        onImagePress={onImageTap}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.counter}>{pos + 1} / {order.length}</Text>
          <TouchableOpacity onPress={() => setShuffle(s => !s)} style={styles.iconBtn}>
            <Ionicons name="shuffle" size={24} color={shuffle ? '#fff' : 'rgba(255,255,255,0.35)'} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {controlsVisible && (
        <SafeAreaView style={styles.controlsWrap} pointerEvents="box-none">
          <View style={styles.navRow} pointerEvents="box-none">
            <TouchableOpacity onPress={() => manualNav(-1)} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => manualNav(1)} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={32} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomBar}>
            <View style={styles.speedRow}>
              {SPEEDS.map(s => (
                <TouchableOpacity key={s} onPress={() => setSpeed(s)} style={[styles.speedPill, speed === s && styles.speedPillActive]}>
                  <Text style={[styles.speedText, speed === s && styles.speedTextActive]}>{SPEED_LABELS[s]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => { setControlsVisible(false); setPlaying(true); }} style={styles.actionBtn}>
                <Ionicons name="play" size={26} color="#fff" />
                <Text style={styles.actionLabel}>Play</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
                <Ionicons name="share-outline" size={26} color="#fff" />
                <Text style={styles.actionLabel}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleToggleFav} style={styles.actionBtn}>
                <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={26} color={isFav ? '#E24B4A' : '#fff'} />
                <Text style={styles.actionLabel}>{isFav ? 'Faved' : 'Favourite'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleInfo} style={styles.actionBtn}>
                <Ionicons name="information-circle-outline" size={26} color="#fff" />
                <Text style={styles.actionLabel}>Info</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fileName} numberOfLines={1}>{currentItem?.name}</Text>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  counter: { color: '#fff', fontSize: 14, fontWeight: '500' },
  controlsWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  navRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  navBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.55)', paddingTop: 12 },
  speedRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  speedPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)' },
  speedPillActive: { backgroundColor: '#185FA5' },
  speedText: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  speedTextActive: { color: '#fff' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6, minWidth: 56 },
  actionLabel: { color: '#fff', fontSize: 11, marginTop: 4 },
  fileName: { color: '#888', fontSize: 12, textAlign: 'center', paddingVertical: 4 },
  exitBtn: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#185FA5', borderRadius: 8 },
});
