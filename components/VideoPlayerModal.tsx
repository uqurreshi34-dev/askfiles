import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, TouchableOpacity, Text, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MediaPlayerView } from 'media-player';
import * as ScreenOrientation from 'expo-screen-orientation';
import { shareFiles, openFile as openFileNative } from '@/modules/share-module';
import { getMimeType, toPath, formatDuration } from '@/utils/files';
import { useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
    uri: string | null;
    onClose: () => void;
    speedPills?: boolean;
    hidePill?: boolean;
    hideShare?: boolean;
  }

  export default function VideoPlayerModal({ uri, onClose, speedPills = false, hidePill = false, hideShare = false }: Props) {
  const [paused, setPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [seekFlash, setSeekFlash] = useState<'back' | 'forward' | null>(null);
  const seekFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubberWidth = useRef(0);
  const isDragging = useRef(false);
  const wasPlayingBeforeDrag = useRef(false);
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;

  function reset() {
    setPaused(false);
    setControlsVisible(false);
    setSpeed(1.0);
    setDuration(0);
    setPosition(0);
    setSeekTo(undefined);
    setSeekFlash(null);
    if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
  }

useEffect(() => {
  if (uri !== null) {
    if (!isTablet) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    }
    return () => {
      if (!isTablet) {
        ScreenOrientation.unlockAsync();
      }
    };
  }
}, [uri]);

  return (
    <Modal
      visible={uri !== null}
      transparent={false}
      animationType="fade"
      onRequestClose={() => { reset(); onClose(); }}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        {uri && (
          <MediaPlayerView
            uri={uri}
            speed={speed}
            paused={paused}
            onTap={() => setControlsVisible(v => !v)}
            {...(seekTo !== undefined ? { seekTo } : {})}
            onProgress={(e: any) => {
              if (!isDragging.current) setPosition(e.nativeEvent.position);
              if (e.nativeEvent.duration) setDuration(e.nativeEvent.duration);
            }}
            onSeek={(e: any) => {
              setPosition(e.nativeEvent.position);
              setSeekTo(undefined);
              const prev = position;
              const next = e.nativeEvent.position;
              if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
              setSeekFlash(next > prev ? 'forward' : 'back');
              seekFlashTimer.current = setTimeout(() => setSeekFlash(null), 600);
            }}
            onPlayingStateChange={(e: any) => {
              const isPlaying = e.nativeEvent.isPlaying;
              setControlsVisible(!isPlaying);
              setPaused(!isPlaying);
              if (e.nativeEvent.duration) setDuration(e.nativeEvent.duration);
            }}
            onComplete={() => setPaused(true)}
            style={StyleSheet.absoluteFill}
          />
        )}
        {controlsVisible && (
          <>
            <TouchableOpacity
              onPress={() => setPaused(p => !p)}
              style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -32 }, { translateY: -32 }], width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={paused ? 'play' : 'pause'} size={32} color="#fff" />
            </TouchableOpacity>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']}
              locations={[0, 0.35, 0.6, 1]}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 }}>
                {speedPills && (
                  <View style={{ alignItems: 'center', gap: 8 }} onStartShouldSetResponder={() => true}>
                    {[0.5, 1.0, 1.5, 2.0].map(s => (
                      <TouchableOpacity key={s} onPress={() => setSpeed(s)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: speed === s ? '#185FA5' : 'rgba(255,255,255,0.15)' }}>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{s}x</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              {duration > 0 && (
                <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                  <View
                    style={{ height: 20, justifyContent: 'center' }}
                    onLayout={(e) => { scrubberWidth.current = e.nativeEvent.layout.width; }}
                    onStartShouldSetResponder={() => true}
                    onResponderGrant={(e) => {
                      isDragging.current = true;
                      wasPlayingBeforeDrag.current = !paused;
                      setPaused(true);
                      const x = Math.max(0, Math.min(e.nativeEvent.locationX, scrubberWidth.current));
                      setPosition(Math.round((x / scrubberWidth.current) * duration));
                    }}
                    onResponderMove={(e) => {
                      const x = Math.max(0, Math.min(e.nativeEvent.locationX, scrubberWidth.current));
                      setPosition(Math.round((x / scrubberWidth.current) * duration));
                    }}
                    onResponderRelease={(e) => {
                      const x = Math.max(0, Math.min(e.nativeEvent.locationX, scrubberWidth.current));
                      const ms = Math.round((x / scrubberWidth.current) * duration);
                      setPosition(ms);
                      setSeekTo(ms);
                      isDragging.current = false;
                      if (wasPlayingBeforeDrag.current) setPaused(false);
                    }}
                  >
                    <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2 }}>
                      <View style={{ height: 3, backgroundColor: '#fff', borderRadius: 2, width: `${Math.min((position / duration) * 100, 100)}%` }} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10 }}>{formatDuration(position)}</Text>
                  <Text style={{ color: '#fff', fontSize: 10 }}>{formatDuration(duration)}</Text>
                  </View>
                </View>
              )}
            </SafeAreaView>
         {!hidePill && (
            <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
              <View style={{ alignItems: 'center', paddingBottom: 24 }}>
                <View style={{ flexDirection: 'row', gap: 0, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 30, overflow: 'hidden' }}>
                {!hideShare && (
                    <>
                      <TouchableOpacity onPress={async () => { if (!uri) return; try { await shareFiles([toPath(uri)], 'video/*'); } catch {} }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                        <Ionicons name="share-outline" size={22} color="#222" />
                      </TouchableOpacity>
                      <View style={{ width: 0.5, backgroundColor: 'rgba(0,0,0,0.15)', marginVertical: 10 }} />
                    </>
                  )}
                  <View style={{ width: 0.5, backgroundColor: 'rgba(0,0,0,0.15)', marginVertical: 10 }} />
                  <TouchableOpacity onPress={async () => { if (!uri) return; setPaused(true); try { await openFileNative(toPath(uri), getMimeType(uri.split('/').pop() ?? '')); } catch {} }} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                    <Ionicons name="open-outline" size={22} color="#222" />
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>
        )}
          </>
        )}
        {seekFlash && (
              <View pointerEvents="none" style={{
                position: 'absolute',
                top: '40%',
                left: seekFlash === 'back' ? '10%' : undefined,
                right: seekFlash === 'forward' ? '10%' : undefined,
                alignItems: 'center',
                gap: 2,
                backgroundColor: 'rgba(0,0,0,0.55)',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 40,
              }}>
                <Ionicons name={seekFlash === 'back' ? 'play-back' : 'play-forward'} size={40} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>10s</Text>
              </View>
            )}
      </View>
    </Modal>
  );
}
