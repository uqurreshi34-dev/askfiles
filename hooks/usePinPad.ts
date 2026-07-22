import { useRef, useState } from 'react';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

const DWELL_MS = 110;
const PIVOT_DOT = 0.3;
const MOVE_THRESHOLD = 12;

type Params = {
  value: string;
  setValue: (updater: (prev: string) => string) => void;
  onComplete: (code: string) => void;
  onEdit?: () => void;
};

export function usePinPad({ value, setValue, onComplete, onEdit }: Params) {
  const frames = useRef(new Map<string, { x: number; y: number; w: number; h: number }>()).current;
  const g = useRef({
    lastKey: null as string | null,
    committed: null as string | null,
    enterTime: 0, enterX: 0, enterY: 0,
    prevDX: 0, prevDY: 0,
    startX: 0, startY: 0, moved: false,
    completed: false,
  }).current;

  function keyAt(x: number, y: number): string | null {
    for (const [d, f] of frames) {
      if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return d;
    }
    return null;
  }

  // Single commit path for BOTH tap and swipe — the value passed to
  // onComplete is always the freshly-built 4-char string, never state.
  function push(digit: string, fromSwipe = false) {
    if (g.completed) return;                 // one attempt per finger-down
    onEdit?.();
    if (value.length >= 4) return;
    const next = value + digit;
    setValue(() => next);
    if (fromSwipe) {
      const c = keyCenter(digit);
      if (c && pathPoints.length < 4) setPathPoints(prev => [...prev, c]);
    }
    if (next.length === 4) {
      g.completed = true;                    // latch until finger lifts
      setTimeout(() => onComplete(next), 0);
    }
  }

  function reset() {
    g.lastKey = null; g.committed = null; g.enterTime = 0;
    g.prevDX = 0; g.prevDY = 0; g.moved = false;
    g.completed = false;
  }

  const [pathPoints, setPathPoints] = useState<{ x: number; y: number }[]>([]);
  const [isSwiping, setIsSwiping] = useState(false);

  function keyCenter(digit: string): { x: number; y: number } | null {
    const f = frames.get(digit);
    if (!f) return null;
    return { x: f.x + f.w / 2, y: f.y + f.h / 2 };
  }

  const gesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      reset();
      g.lastKey = keyAt(e.x, e.y);
      g.enterTime = Date.now();
      g.enterX = e.x; g.enterY = e.y;
      g.startX = e.x; g.startY = e.y;
    })
    .onUpdate((e) => {
      const digit = keyAt(e.x, e.y);
      const now = Date.now();

      if (!g.moved) {
        const dist = Math.hypot(e.x - g.startX, e.y - g.startY);
        if (dist < MOVE_THRESHOLD) return;
        g.moved = true;
        setIsSwiping(true);
        setPathPoints([]);                        // fresh trail
        const start = keyAt(g.startX, g.startY);
        setValue(() => (start ? start : ''));
        g.committed = start;
        if (start) {
          const c = keyCenter(start);
          if (c) setPathPoints([c]);
        }
      }

      const dx = e.x - g.enterX, dy = e.y - g.enterY;

      if (digit !== g.lastKey) {
        g.lastKey = digit;
        g.enterTime = now;
        g.enterX = e.x; g.enterY = e.y;
        if (digit && digit !== g.committed) {
          const l1 = Math.hypot(g.prevDX, g.prevDY);
          const l2 = Math.hypot(dx, dy);
          if (l1 > 4 && l2 > 4) {
            const dot = (g.prevDX * dx + g.prevDY * dy) / (l1 * l2);
            if (dot < PIVOT_DOT) { push(digit, true); g.committed = digit; }
          }
        }
        g.prevDX = dx; g.prevDY = dy;
      } else if (digit && digit !== g.committed) {
        if (now - g.enterTime >= DWELL_MS) { push(digit, true); g.committed = digit; }
      }

      if (digit === null) g.committed = null;
    })
    .onFinalize(() => {
      reset();
      setIsSwiping(false);
      setPathPoints([]);
    });

  const keyProps = {
    onTap: (digit: string) => push(digit),
    onDelete: () => { onEdit?.(); setValue(prev => prev.slice(0, -1)); },
    onMeasure: (digit: string, e: any) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      frames.set(digit, { x, y, w: width, h: height });
    },
  };

  const pathD = pathPoints.length > 0
  ? pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  : '';

  return { keyProps, gesture, GestureDetector, pathPoints, isSwiping, pathD };
}
