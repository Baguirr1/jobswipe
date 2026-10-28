import * as Haptics from 'expo-haptics';
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import type { SwipeDirection } from '@/lib/types';

const VISIBLE_CARDS = 3;
const SWIPE_VELOCITY = 800;
const FLY_OUT_MS = 220;
const SPRING = { damping: 18, stiffness: 180 };

export interface SwipeDeckHandle {
  /** Programmatically swipe the top card (used by the like/pass buttons). */
  swipe: (direction: SwipeDirection) => void;
}

interface SwipeDeckProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderFront: (item: T) => ReactNode;
  /** Optional back face, revealed by tapping the card. */
  renderBack?: (item: T) => ReactNode;
  /**
   * Called once the fly-out animation finishes. The parent should remove the
   * item from `data` immediately (optimistic) and persist in the background.
   */
  onSwipe: (item: T, direction: SwipeDirection) => void;
  emptyComponent?: ReactNode;
  likeLabel?: string;
  nopeLabel?: string;
  ref?: Ref<SwipeDeckHandle>;
}

export function SwipeDeck<T>({
  data,
  keyExtractor,
  renderFront,
  renderBack,
  onSwipe,
  emptyComponent,
  likeLabel = 'APPLY',
  nopeLabel = 'PASS',
  ref,
}: SwipeDeckProps<T>) {
  // 0 → top card at rest, 1 → top card dragged past the swipe threshold.
  // Drives the "next card rises" effect for the cards underneath.
  const progress = useSharedValue(0);
  const flingTop = useRef<((d: SwipeDirection) => void) | null>(null);
  const topKey = data[0] ? keyExtractor(data[0]) : null;

  // Runs before paint when the top card changes, so the new back cards
  // never render with the previous card's drag progress.
  useLayoutEffect(() => {
    progress.set(0);
  }, [topKey, progress]);

  useImperativeHandle(ref, () => ({
    swipe: (direction) => flingTop.current?.(direction),
  }));

  if (!data.length) return <>{emptyComponent}</>;

  const visible = data.slice(0, VISIBLE_CARDS);

  return (
    <View style={styles.deck}>
      {visible
        .map((item, index) => (
          <DeckCard
            key={keyExtractor(item)}
            item={item}
            index={index}
            progress={progress}
            renderFront={renderFront}
            renderBack={renderBack}
            onSwiped={onSwipe}
            registerFling={index === 0 ? (fn) => (flingTop.current = fn) : undefined}
            likeLabel={likeLabel}
            nopeLabel={nopeLabel}
          />
        ))
        // Render bottom-most first so the top card paints last.
        .reverse()}
    </View>
  );
}

interface DeckCardProps<T> {
  item: T;
  index: number;
  progress: SharedValue<number>;
  renderFront: (item: T) => ReactNode;
  renderBack?: (item: T) => ReactNode;
  onSwiped: (item: T, direction: SwipeDirection) => void;
  registerFling?: (fn: (d: SwipeDirection) => void) => void;
  likeLabel: string;
  nopeLabel: string;
}

function DeckCard<T>({
  item,
  index,
  progress,
  renderFront,
  renderBack,
  onSwiped,
  registerFling,
  likeLabel,
  nopeLabel,
}: DeckCardProps<T>) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.28;
  const offscreen = width * 1.5;
  const isTop = index === 0;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const flip = useSharedValue(0); // 0 = front, 180 = back
  const [flipped, setFlipped] = useState(false);
  const swiping = useRef(false);

  const finish = (direction: SwipeDirection) => {
    if (swiping.current) return;
    swiping.current = true;
    onSwiped(item, direction);
  };

  const commitHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const flyOut = (direction: SwipeDirection, velocityY = 0) => {
    'worklet';
    const sign = direction === 'right' ? 1 : -1;
    progress.set(withTiming(1, { duration: FLY_OUT_MS }));
    ty.set(withTiming(ty.get() + velocityY * 0.1, { duration: FLY_OUT_MS }));
    tx.set(
      withTiming(sign * offscreen, { duration: FLY_OUT_MS }, (done) => {
        if (done) scheduleOnRN(finish, direction);
      }),
    );
  };

  // Buttons call this from JS; the animation itself runs on the UI thread.
  useEffect(() => {
    registerFling?.((direction) => {
      if (swiping.current) return;
      commitHaptic();
      scheduleOnUI(flyOut, direction);
    });
  });

  const toggleFlip = () => {
    if (!renderBack) return;
    const next = !flipped;
    setFlipped(next);
    flip.set(withTiming(next ? 180 : 0, { duration: 350 }));
  };

  const pan = usePanGesture({
    enabled: isTop,
    // Horizontal intent activates the swipe; when flipped, vertical movement
    // fails it so the description ScrollView can scroll.
    activeOffsetX: [-12, 12],
    failOffsetY: flipped ? [-14, 14] : undefined,
    onUpdate: (e) => {
      'worklet';
      tx.set(e.translationX);
      ty.set(e.translationY);
      progress.set(Math.min(Math.abs(e.translationX) / threshold, 1));
    },
    onDeactivate: (e) => {
      'worklet';
      const x = tx.get();
      const projected = x + e.velocityX * 0.15;
      const shouldSwipe =
        !e.canceled &&
        (Math.abs(x) > threshold || Math.abs(e.velocityX) > SWIPE_VELOCITY);

      if (shouldSwipe) {
        scheduleOnRN(commitHaptic);
        flyOut(projected > 0 ? 'right' : 'left', e.velocityY);
      } else {
        tx.set(withSpring(0, SPRING));
        ty.set(withSpring(0, SPRING));
        progress.set(withSpring(0, SPRING));
      }
    },
  });

  const tap = useTapGesture({
    enabled: isTop,
    onActivate: () => {
      'worklet';
      scheduleOnRN(toggleFlip);
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  const cardStyle = useAnimatedStyle(() => {
    if (isTop) {
      const rotate = interpolate(tx.value, [-width, 0, width], [-14, 0, 14]);
      return {
        transform: [
          { translateX: tx.value },
          { translateY: ty.value },
          { rotate: `${rotate}deg` },
        ],
      };
    }
    // Cards underneath scale up / rise as the top card is dragged away.
    const scale = interpolate(progress.value, [0, 1], [1 - index * 0.05, 1 - (index - 1) * 0.05]);
    const translateY = interpolate(progress.value, [0, 1], [index * 14, (index - 1) * 14]);
    return { transform: [{ translateY }, { scale }] };
  });

  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const nopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value + 180}deg` }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.card, cardStyle]}
        pointerEvents={isTop ? 'auto' : 'none'}
        accessibilityHint={isTop ? 'Swipe right to apply, left to pass, tap for details' : undefined}
      >
        <Animated.View style={[styles.face, frontStyle]} pointerEvents={flipped ? 'none' : 'auto'}>
          {renderFront(item)}
        </Animated.View>
        {renderBack && (
          <Animated.View style={[styles.face, backStyle]} pointerEvents={flipped ? 'auto' : 'none'}>
            {renderBack(item)}
          </Animated.View>
        )}

        {isTop && (
          <>
            <Animated.View style={[styles.stamp, styles.likeStamp, likeStyle]} pointerEvents="none">
              <Text style={[styles.stampText, { color: '#22C55E' }]}>{likeLabel}</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStyle]} pointerEvents="none">
              <Text style={[styles.stampText, { color: '#EF4444' }]}>{nopeLabel}</Text>
            </Animated.View>
          </>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1 },
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  face: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    backgroundColor: '#fff',
  },
  stamp: {
    position: 'absolute',
    top: 36,
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  likeStamp: { left: 24, borderColor: '#22C55E', transform: [{ rotate: '-15deg' }] },
  nopeStamp: { right: 24, borderColor: '#EF4444', transform: [{ rotate: '15deg' }] },
  stampText: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
});
