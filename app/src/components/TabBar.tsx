import React, { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C } from '../theme';
import { T } from '../i18n/T';
import { Icon, type IconName } from './ui';
import { Animated, DUR, EASE } from './motion';

/** Shared tab options: calm dark bar, translated labels, cross-fading scenes. */
export function useTabOptions() {
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    animation: 'fade' as const,
    tabBarActiveTintColor: C.text,
    tabBarInactiveTintColor: C.muted,
    tabBarStyle: {
      height: 70 + insets.bottom,
      paddingBottom: insets.bottom + 6,
      paddingTop: 8,
      backgroundColor: C.bg,
      borderTopColor: C.border,
      borderTopWidth: 1,
      elevation: 0,
    },
    sceneStyle: { backgroundColor: C.bg },
  };
}

/** Icon that lifts slightly and gains a soft pill behind it when its tab is focused. */
function TabIcon({ icon, color, focused }: { icon: IconName; color: ColorValue; focused: boolean }) {
  const f = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    f.set(withTiming(focused ? 1 : 0, { duration: DUR.base, easing: EASE }));
  }, [focused, f]);
  const pill = useAnimatedStyle(() => ({
    opacity: f.get(),
    transform: [{ scaleX: interpolate(f.get(), [0, 1], [0.6, 1]) }],
  }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(f.get(), [0, 1], [1, -1]) }] }));
  return (
    <Animated.View style={[{ width: 60, height: 32, alignItems: 'center', justifyContent: 'center' }, lift]}>
      <Animated.View
        style={[{ position: 'absolute', width: 60, height: 32, borderRadius: 16, backgroundColor: C.greenLight }, pill]}
      />
      <Icon name={icon} size={26} color={focused ? C.greenDark : (color as string)} />
    </Animated.View>
  );
}

export function tab(label: string, icon: IconName) {
  return {
    tabBarLabel: ({ color }: { color: ColorValue }) => (
      <T style={{ fontSize: 12, fontWeight: '600', color, marginTop: 4 }} numberOfLines={1}>
        {label}
      </T>
    ),
    tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <TabIcon icon={icon} color={color} focused={focused} />
    ),
  };
}
