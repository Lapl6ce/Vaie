/**
 * Celebration overlay. Calm on purpose: the backdrop dims, the card settles in,
 * a single soft ring expands from the icon, a success haptic plays. No confetti, no bounce.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import * as Haptics from 'expo-haptics';
import { FadeIn, FadeOut, interpolate, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { C, shadow, WORDMARK_FONT } from '../theme';
import { T } from '../i18n/T';
import { Icon, type IconName } from './ui';
import { Animated, DUR, EASE, rise, settle } from './motion';
import { speak } from '../voice/speaker';

type Celebrate = { icon: IconName; title: string; subtitle?: string; big?: string; color?: string; say?: boolean };
const Ctx = createContext<(c: Celebrate) => void>(() => {});
export const useCelebrate = () => useContext(Ctx);

function Ring({ color }: { color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(120, withTiming(1, { duration: 1400, easing: EASE })));
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0, 0.15, 1], [0, 0.5, 0]),
    transform: [{ scale: interpolate(t.get(), [0, 1], [0.9, 1.9]) }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, style]} />;
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<(Celebrate & { id: number })[]>([]);
  const current = queue[0];

  const celebrate = useCallback((c: Celebrate) => {
    setQueue((q) => [...q, { ...c, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    if (!current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (current.say) speak([current.title, current.subtitle ?? ''].filter(Boolean));
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 3200);
    return () => clearTimeout(t);
  }, [current]);

  const color = current?.color ?? C.gold;

  return (
    <Ctx.Provider value={celebrate}>
      {children}
      {current ? (
        <Animated.View
          key={current.id}
          entering={FadeIn.duration(DUR.base)}
          exiting={FadeOut.duration(DUR.base)}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setQueue((q) => q.slice(1))} />
          <Animated.View entering={settle(60)} style={styles.card} pointerEvents="none">
            <View style={styles.iconWrap}>
              <Ring color={color} />
              <View style={[styles.iconCircle, { backgroundColor: color + '1F' }]}>
                <Icon name={current.icon} size={56} color={color} />
              </View>
            </View>
            {current.big ? (
              <Animated.View entering={rise(220)}>
                <Text style={[styles.big, { color }]}>{current.big}</Text>
              </Animated.View>
            ) : null}
            <Animated.View entering={rise(280)}>
              <T style={styles.title}>{current.title}</T>
            </Animated.View>
            {current.subtitle ? (
              <Animated.View entering={rise(340)}>
                <T style={styles.subtitle}>{current.subtitle}</T>
              </Animated.View>
            ) : null}
          </Animated.View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,6,8,0.78)', alignItems: 'center', justifyContent: 'center' },
  card: { ...shadow, backgroundColor: C.card, borderRadius: 32, paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center', width: '84%', gap: 8 },
  iconWrap: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ring: { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 2 },
  iconCircle: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 46, fontFamily: WORDMARK_FONT, lineHeight: 58 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: C.text },
  subtitle: { fontSize: 19, textAlign: 'center', color: C.muted },
});
