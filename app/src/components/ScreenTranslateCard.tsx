/**
 * "Translate other apps" card on the Translate screen. Turns the floating screen-translate
 * bubble on/off (native module, Vaie APK only) and walks through the overlay permission.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState as RNAppState, StyleSheet, View } from 'react-native';
import { C } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { langByCode } from '../i18n/languages';
import { getServerUrl } from '../lib/api';
import { ScreenTranslate } from '../lib/screenTranslate';
import { Button, Icon } from './ui';
import { Animated, rise } from './motion';

export function ScreenTranslateCard({ target }: { target: string }) {
  const [running, setRunning] = useState(() => ScreenTranslate?.isRunning() ?? false);
  const [canOverlay, setCanOverlay] = useState(() => ScreenTranslate?.canDrawOverlays() ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = langByCode(target).native;

  // Re-check when the user comes back from Android settings or the notification's Stop.
  useEffect(() => {
    if (!ScreenTranslate) return;
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      setRunning(ScreenTranslate!.isRunning());
      setCanOverlay(ScreenTranslate!.canDrawOverlays());
    });
    return () => sub.remove();
  }, []);

  // Keep the bubble's language in sync with the picker on this screen.
  useEffect(() => {
    if (running) ScreenTranslate?.setTarget(target, label);
  }, [running, target, label]);

  const turnOn = useCallback(async () => {
    if (!ScreenTranslate) return;
    setError(null);
    if (!ScreenTranslate.canDrawOverlays()) {
      ScreenTranslate.openOverlaySettings();
      return;
    }
    setBusy(true);
    try {
      const ok = await ScreenTranslate.start(getServerUrl(), target, label);
      setRunning(ok);
    } catch (e: any) {
      setError(e?.message ?? 'Could not start');
    } finally {
      setBusy(false);
    }
  }, [target, label]);

  const turnOff = () => {
    ScreenTranslate?.stop();
    setRunning(false);
  };

  return (
    <Animated.View entering={rise()} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name="layers-outline" size={28} color={C.greenDark} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ fontSize: 20, fontWeight: '700' }}>{S.screenTranslate}</T>
          <T style={{ fontSize: 15, color: C.muted }}>
            {!ScreenTranslate ? S.needsVaieApp : running ? S.screenTranslateOn : canOverlay ? S.screenTranslateDesc : S.overlayPermission}
          </T>
        </View>
      </View>
      {ScreenTranslate ? (
        running ? (
          <Button label={S.screenTranslateStop} icon="stop-circle-outline" variant="outline" color={C.terracotta} onPress={turnOff} />
        ) : canOverlay ? (
          <Button label={S.screenTranslateStart} icon="play-circle-outline" loading={busy} onPress={turnOn} />
        ) : (
          <Button label={S.openSettings} icon="cog-outline" variant="soft" onPress={() => ScreenTranslate!.openOverlaySettings()} />
        )
      ) : null}
      {error ? <T style={{ color: C.danger, fontSize: 15 }}>{error}</T> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 16, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center' },
});
