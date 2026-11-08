import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { Animated, PressableScale, fadeOut, settle, useBreath } from './motion';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, shadow } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { useVoice } from '../voice/VoiceProvider';
import { Icon } from './ui';

/** Pulsing mic. Used as the floating mic on every screen and as the giant mic on Ask Vaie. */
export function MicButton({ size = 72, onPress }: { size?: number; onPress?: () => void }) {
  const { state, toggle } = useVoice();
  const listening = state === 'listening';
  const breath = useBreath(listening, 1800);
  const halo = useAnimatedStyle(() => ({
    opacity: interpolate(breath.get(), [0, 1], [0.0, 0.35]),
    transform: [{ scale: interpolate(breath.get(), [0, 1], [1, 1.35]) }],
  }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: C.terracotta }, halo]}
      />
      <PressableScale
        to={0.92}
        accessibilityRole="button"
        accessibilityLabel={listening ? S.listening : S.tapToSpeak}
        onPress={onPress ?? toggle}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: listening ? C.terracotta : C.green,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {state === 'processing' ? (
          <ActivityIndicator color={listening ? C.white : C.onAccent} size="large" />
        ) : (
          <Icon name={listening ? 'stop' : 'microphone'} size={size * 0.44} color={listening ? C.white : C.onAccent} />
        )}
      </PressableScale>
    </View>
  );
}

/** Floating mic + status bubble ("Listening…", "You said: …", confirmations). Shown on every screen except onboarding. */
export function FloatingVoice() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { state, heard, message } = useVoice();
  if (pathname.startsWith('/onboarding') || pathname === '/live') return null;
  const inTabs = pathname.startsWith('/student') || pathname.startsWith('/adult');
  const bottom = (inTabs ? 84 : 20) + insets.bottom;
  const showBubble = state !== 'idle' || heard || message;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {showBubble ? (
        <Animated.View entering={settle()} exiting={fadeOut} pointerEvents="none" style={[styles.bubble, { bottom: bottom + 78 }]}>
          {state === 'listening' ? <T style={styles.bubbleText}>{S.listening}</T> : null}
          {state === 'processing' && !heard ? <T style={styles.bubbleText}>{S.thinking}</T> : null}
          {heard ? (
            <Text style={styles.heard}>
              “{heard}”
            </Text>
          ) : null}
          {message ? <T style={[styles.bubbleText, { color: C.greenDark }]}>{message}</T> : null}
        </Animated.View>
      ) : null}
      <View style={{ position: 'absolute', right: 16, bottom }}>
        <MicButton size={68} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 16,
    left: 16,
    borderRadius: 20,
    padding: 14,
    gap: 4,
    ...shadow,
    backgroundColor: C.raised,
  },
  bubbleText: { fontSize: 18, fontWeight: '700', color: C.text },
  heard: { fontSize: 18, color: C.muted, fontStyle: 'italic' },
});
