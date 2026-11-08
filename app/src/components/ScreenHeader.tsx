import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S as Size, SERIF } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { useVoice } from '../voice/VoiceProvider';
import { IconButton } from './ui';

/** Header used on every screen: optional back, title, and a speaker that reads the screen's key content. */
export function ScreenHeader({
  title,
  back,
  onClose,
  right,
  color = C.bg,
}: {
  title: string;
  back?: boolean;
  /** Shows a close (✕) button on the left that calls this instead of navigating back. */
  onClose?: () => void;
  right?: React.ReactNode;
  color?: string;
}) {
  const insets = useSafeAreaInsets();
  const { readScreen, speaking, stopAll } = useVoice();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8, backgroundColor: color }]}>
      {onClose ? <IconButton icon="close" label={S.endChat} onPress={onClose} /> : null}
      {back && !onClose ? (
        <IconButton icon="arrow-left" label={S.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      ) : null}
      <T style={styles.title} numberOfLines={2}>
        {title}
      </T>
      {right}
      <IconButton
        icon={speaking ? 'stop' : 'volume-high'}
        label={speaking ? S.stop : S.listen}
        color={speaking ? C.white : C.green}
        bg={speaking ? C.terracotta : C.card}
        onPress={speaking ? stopAll : readScreen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  title: { flex: 1, fontSize: Size.title, fontFamily: SERIF, color: C.text },
});
