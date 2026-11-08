/**
 * Motion system. One curve, one spring, one entrance. Calm and quick: nothing overshoots,
 * nothing travels further than a few pixels, everything settles in under half a second.
 * Built on Reanimated so it all runs on the UI thread.
 */
import React, { useEffect } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
} from 'react-native-reanimated';

/** Expo-out style curve: fast start, long soft landing. */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
export const DUR = { fast: 180, base: 320, slow: 520 };
/** Critically damped: responsive, no wobble. */
export const SPRING = { damping: 22, stiffness: 280, mass: 0.7, reduceMotion: ReduceMotion.System };

// Plain config objects (no function calls), safe to capture inside UI-thread animations.
const T_SLOW = { duration: DUR.slow, easing: EASE, reduceMotion: ReduceMotion.System };
const T_BASE = { duration: DUR.base, easing: EASE, reduceMotion: ReduceMotion.System };
const T_METER = { duration: 700, easing: EASE, reduceMotion: ReduceMotion.System };

/** Fade + 10px rise. `delay` in ms. Use as `entering={rise(i * STAGGER)}`. */
export const STAGGER = 45;
export function rise(delay = 0, distance = 10) {
  return (_: EntryAnimationsValues) => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: distance }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, T_SLOW)),
        transform: [{ translateY: withDelay(delay, withTiming(0, T_SLOW)) }],
      },
    };
  };
}

/** Fade + gentle scale from 96%. For overlays, popovers, result cards. */
export function settle(delay = 0) {
  return (_: EntryAnimationsValues) => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ scale: 0.96 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, T_BASE)),
        transform: [{ scale: withDelay(delay, withTiming(1, T_SLOW)) }],
      },
    };
  };
}

export const fadeOut = FadeOut.duration(DUR.fast);

/** Wraps children in a staggered rise. `i` = position in the list. */
export function Appear({
  i = 0,
  delay = 0,
  style,
  children,
}: {
  i?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Animated.View entering={rise(delay + Math.min(i, 12) * STAGGER)} style={style}>
      {children}
    </Animated.View>
  );
}

const APressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that eases down to `to` while held and springs back. Replaces `pressed && scale` styles. */
export function PressableScale({
  to = 0.97,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style'> & {
  to?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
}) {
  const p = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.get(), [0, 1], [1, to]) }],
    opacity: interpolate(p.get(), [0, 1], [1, 0.88]),
  }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        p.set(withTiming(1, { duration: 110, easing: EASE }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        p.set(withSpring(0, SPRING));
        onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}

/** A value that eases toward `to` whenever it changes (progress bars, meters). Returns a shared value 0..1+. */
export function useEased(to: number, delay = 0) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.set(withDelay(delay, withTiming(to, T_METER)));
  }, [to, delay, v]);
  return v;
}

/** Slow 0→1→0 breathing loop for idle accents (mic halo, current lesson node). */
export function useBreath(active = true, period = 2400) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      v.set(withTiming(0, T_BASE));
      return;
    }
    v.set(withRepeat(withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [active, period, v]);
  return v;
}

export { Animated };
