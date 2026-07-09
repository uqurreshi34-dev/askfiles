import React, { useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue, useAnimatedStyle, withSpring,
  } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import { ToolId } from '@/hooks/useToolsConfig';

export interface ToolDef {
  id: ToolId;
  label: string;
  onPress: () => void;
  circle: React.ReactNode;
  disabled?: boolean;
}

interface Props {
  tools: ToolDef[];
  hiddenTools: ToolId[];
  editMode: boolean;
  onEditMode: (v: boolean) => void;
  onReorder: (ids: ToolId[]) => void;
  onHide: (id: ToolId) => void;
  onRestore: (id: ToolId) => void;
  getToolDef: (id: ToolId) => ToolDef | undefined;
  colors: any;
}

const COLS = 3;
const CELL_HEIGHT = 100;

function DraggableCell({
  item,
  index,
  cellWidth,
  editMode,
  onLongPress,
  onHide,
  onPress,
  onDragEnd,
  colors,
}: {
  item: ToolDef;
  index: number;
  cellWidth: number;
  editMode: boolean;
  onLongPress: () => void;
  onHide: (id: ToolId) => void;
  onPress: () => void;
  onDragEnd: (fromIndex: number, toIndex: number) => void;
  colors: any;
}) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const baseX = col * cellWidth;
  const baseY = row * CELL_HEIGHT;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(1);
  const isDragging = useSharedValue(false);

  // Reset position when index changes (reorder happened)
  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    zIndex.value = 1;
  }, [index]);

  const getIndexFromPosition = (absX: number, absY: number, total: number) => {
    'worklet';
    const col = Math.floor(absX / cellWidth);
    const row = Math.floor(absY / CELL_HEIGHT);
    const idx = row * COLS + col;
    return Math.max(0, Math.min(total - 1, idx));
  };

  const gesture = Gesture.Pan()
    .minDistance(10)
    .onStart(() => {
      if (!editMode) return;
      isDragging.value = true;
      scale.value = withSpring(1.1);
      zIndex.value = 999;
    })
    .onUpdate((e) => {
      if (!isDragging.value) return;
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (!isDragging.value) return;
      isDragging.value = false;
      scale.value = withSpring(1);
      zIndex.value = 1;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);

      const absX = baseX + e.translationX + cellWidth / 2;
      const absY = baseY + e.translationY + CELL_HEIGHT / 2;
      const toIndex = getIndexFromPosition(absX, absY, 9);
      if (toIndex !== index) {
        scheduleOnRN(onDragEnd, index, toIndex);
      }
    })
    .onFinalize(() => {
      if (isDragging.value) {
        isDragging.value = false;
        scale.value = withSpring(1);
        zIndex.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
        scheduleOnRN(onLongPress);
    });

  const composed = editMode
    ? gesture
    : Gesture.Simultaneous(longPressGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    elevation: isDragging.value ? 10 : 0,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width: cellWidth, alignItems: 'center', paddingVertical: 8 }, animStyle]}>
        <TouchableOpacity
          onPress={editMode ? undefined : onPress}
          activeOpacity={editMode ? 1 : 0.7}
          disabled={item.disabled && !editMode}
          style={{ width: cellWidth, alignItems: 'center' }}
        >
          <View style={{ position: 'relative' }}>
            {item.circle}
            {editMode && (
              <TouchableOpacity
                onPress={() => onHide(item.id)}
                style={{
                  position: 'absolute',
                  top: -6, right: -6,
                  width: 20, height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.deleteRed,
                  alignItems: 'center', justifyContent: 'center',
                  zIndex: 10,
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            )}
            {editMode && (
              <View style={{
                position: 'absolute',
                bottom: -4, right: -4,
                width: 18, height: 18,
                borderRadius: 4,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="reorder-two-outline" size={11} color={colors.textMuted} />
              </View>
            )}
          </View>
          <Text style={{
            fontSize: 12, fontWeight: '500',
            textAlign: 'center', color: colors.textPrimary, marginTop: 6,
          }} numberOfLines={1}>
            {item.label}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

export default function ToolsGrid({
  tools, hiddenTools, editMode, onEditMode,
  onReorder, onHide, onRestore, getToolDef, colors,
}: Props) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const cellWidth = SCREEN_WIDTH / COLS;

  const enterEditMode = useCallback(async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onEditMode(true);
  }, [onEditMode]);

  const exitEditMode = useCallback(async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    onEditMode(false);
  }, [onEditMode]);

  const handleDragEnd = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newOrder = [...tools.map(t => t.id)];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    // Merge with hidden tools to get full order
    onReorder(newOrder);
  }, [tools, onReorder]);

  return (
    <View>
      {editMode && (
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16, paddingBottom: 12,
        }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            Long press to drag · tap × to hide
          </Text>
          <TouchableOpacity
            onPress={exitEditMode}
            style={{
              backgroundColor: colors.blue, borderRadius: 8,
              paddingHorizontal: 16, paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Visible tools grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: editMode ? 8 : 16 }}>
        {tools.length === 0 ? (
          <TouchableOpacity
            onPress={enterEditMode}
            style={{ width: '100%', alignItems: 'center', paddingVertical: 24, gap: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={32} color={colors.textMuted} />
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Tap to restore tools</Text>
          </TouchableOpacity>
        ) : tools.map((item, index) => (
          <DraggableCell
            key={item.id}
            item={item}
            index={index}
            cellWidth={cellWidth}
            editMode={editMode}
            onLongPress={enterEditMode}
            onHide={onHide}
            onPress={item.onPress}
            onDragEnd={handleDragEnd}
            colors={colors}
          />
        ))}
      </View>

      {/* Hidden tools */}
      {editMode && hiddenTools.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={{ height: 1, backgroundColor: colors.divider, marginBottom: 12 }} />
          <Text style={{
            fontSize: 11, fontWeight: '500', color: colors.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
          }}>
            Hidden — tap to restore
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {hiddenTools.map(id => {
              const def = getToolDef(id);
              if (!def) return null;
              return (
                <TouchableOpacity
                  key={id}
                  style={{ width: '33.33%', alignItems: 'center', paddingVertical: 8, opacity: 0.4 }}
                  onPress={() => onRestore(id)}
                  activeOpacity={0.7}
                >
                  {def.circle}
                  <Text style={{ fontSize: 12, fontWeight: '500', textAlign: 'center', color: colors.textPrimary, marginTop: 6 }} numberOfLines={1}>
                    {def.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
