import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, S as Size, shadow, onColor } from '../theme';
import { Animated, PressableScale, useEased, rise } from './motion';
import { useAnimatedStyle } from 'react-native-reanimated';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { speak } from '../voice/speaker';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export const Icon = MaterialCommunityIcons;

export const tap = () => Haptics.selectionAsync().catch(() => {});

type BtnProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  color?: string;
  textColor?: string;
  variant?: 'solid' | 'outline' | 'soft';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
};

export function Button({ label, onPress, icon, color = C.green, textColor, variant = 'solid', disabled, loading, style, big }: BtnProps) {
  const solid = variant === 'solid';
  const fg = textColor ?? (solid ? onColor(color) : color);
  return (
    <PressableScale
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.btn,
        big && { minHeight: 72, borderRadius: 24 },
        solid && { backgroundColor: color },
        variant === 'outline' && { borderWidth: 1.5, borderColor: color + '66', backgroundColor: 'transparent' },
        variant === 'soft' && { backgroundColor: color + '1F' },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={big ? 30 : 26} color={fg} /> : null}
          <T style={[styles.btnText, big && { fontSize: Size.large }, { color: fg }]}>{label}</T>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  color = C.green,
  bg = C.card,
  size = 56,
  label,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  bg?: string;
  size?: number;
  label: string;
}) {
  return (
    <PressableScale
      to={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        bg !== 'transparent' && shadow,
      ]}
    >
      <Icon name={icon} size={size * 0.46} color={color} />
    </PressableScale>
  );
}

/** A small speaker button that reads the given English text aloud (translated). */
export function SpeakButton({ text, size = 48, color = C.green }: { text: string | string[]; size?: number; color?: string }) {
  return <IconButton icon="volume-high" label={S.listen} size={size} color={color} onPress={() => speak(text)} />;
}

/** Surface. Rises in on mount; pass `i` to stagger it with its siblings. */
export function Card({ children, style, i = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; i?: number }) {
  return (
    <Animated.View entering={rise(i * 45)} style={[styles.card, style]}>
      {children}
    </Animated.View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <PressableScale
      to={0.95}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.chip, active && { backgroundColor: C.green, borderColor: C.green }]}
    >
      {icon ? <Icon name={icon} size={22} color={active ? C.onAccent : C.muted} /> : null}
      <T style={[styles.chipText, active && { color: C.onAccent }]}>{label}</T>
    </PressableScale>
  );
}

/** Fills smoothly from its previous value whenever `value` changes. */
export function ProgressBar({ value, color = C.gold, height = 10 }: { value: number; color?: string; height?: number }) {
  const v = useEased(Math.max(0, Math.min(1, value)), 120);
  const fill = useAnimatedStyle(() => ({ width: `${v.get() * 100}%` }));
  return (
    <View style={{ height, backgroundColor: C.border, borderRadius: height, overflow: 'hidden' }}>
      <Animated.View style={[{ height, backgroundColor: color, borderRadius: height }, fill]} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={C.muted} />
      <T style={{ color: C.muted, marginTop: 12 }}>{S.loading}</T>
    </View>
  );
}

/** Friendly error with a retry. The message is English and gets translated; tap the speaker to hear it. */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.center, { padding: 24 }]}>
      <Icon name="emoticon-sad-outline" size={72} color={C.terracotta} />
      <T style={{ fontSize: Size.large, textAlign: 'center', marginVertical: 16, color: C.text }}>{message}</T>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SpeakButton text={message} />
        {onRetry ? <Button label={S.retry} icon="refresh" onPress={onRetry} /> : null}
      </View>
    </View>
  );
}

export function Stars({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3].map((i) => (
        <Icon key={i} name={i <= n ? 'star' : 'star-outline'} size={size} color={i <= n ? C.gold : C.locked} />
      ))}
    </View>
  );
}

export function Pill({ icon, text, color, bg }: { icon: IconName; text: string | number; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Icon name={icon} size={22} color={color} />
      <Text style={{ fontSize: Size.body, fontWeight: '800', color }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: Size.touch,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnText: { fontSize: Size.body, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  card: { backgroundColor: C.card, borderRadius: Size.radius, padding: Size.pad, ...shadow },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { fontSize: 17, fontWeight: '700', color: C.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
});
