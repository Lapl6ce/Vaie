/**
 * Live camera translate. The camera stays open; every couple of seconds a small, silent frame
 * goes to the server (Gemini reads the text, Sarvam translates it) and the translation
 * cross-fades in on top of the camera view. No photo taking, no uploading: just point.
 *
 * Note: translating OTHER apps' screens needs Android screen capture + an overlay, which
 * Expo Go cannot do. Pointing this camera at another screen works as the stand-in.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { LANGUAGES, hasVoice } from '../i18n/languages';
import { Button, Icon, IconButton, tap } from '../components/ui';
import { Animated, PressableScale, fadeOut, rise, useBreath } from '../components/motion';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import { speakRaw, stopSpeaking } from '../voice/speaker';

const INTERVAL_MS = 2200; // between frame captures (server allows 40 AI calls/min)
const ERROR_BACKOFF_MS = 5000;
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();

type Reading = { id: number; original: string; translated: string; target: string };

/** Pick a capture size around 1280px wide: plenty for reading text, small enough to send fast. */
function pickSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map((s) => {
      const [w, h] = s.split('x').map(Number);
      return { s, w: Math.max(w, h) };
    })
    .filter((x) => x.w > 0);
  if (!parsed.length) return undefined;
  parsed.sort((a, b) => Math.abs(a.w - 1280) - Math.abs(b.w - 1280));
  return parsed[0].s;
}

function Reticle({ scanning }: { scanning: boolean }) {
  const breath = useBreath(scanning, 2400);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(breath.get(), [0, 1], [0.45, 0.9]),
    transform: [{ scale: interpolate(breath.get(), [0, 1], [1, 1.015]) }],
  }));
  const corner = { position: 'absolute' as const, width: 34, height: 34, borderColor: '#FFFFFF' };
  return (
    <Animated.View pointerEvents="none" style={[styles.reticle, style]}>
      <View style={[corner, { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 18 }]} />
      <View style={[corner, { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 18 }]} />
      <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 18 }]} />
      <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 18 }]} />
    </Animated.View>
  );
}

function StatusDot({ on }: { on: boolean }) {
  const breath = useBreath(on, 1400);
  const style = useAnimatedStyle(() => ({ opacity: interpolate(breath.get(), [0, 1], [0.35, 1]) }));
  return <Animated.View style={[styles.dot, { backgroundColor: on ? C.greenDark : C.muted }, style]} />;
}

export default function LiveTranslate() {
  const insets = useSafeAreaInsets();
  const { lang } = useApp();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<string | undefined>();
  const [focused, setFocused] = useState(true);
  const [paused, setPaused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [target, setTarget] = useState(lang && lang !== 'en' ? lang : 'hi');
  const [reading, setReading] = useState<Reading | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Latest values for the capture loop without restarting it.
  const live = useRef({ target, lastKey: '' });
  useEffect(() => {
    live.current.target = target;
    live.current.lastKey = ''; // re-translate the current scene into the new language
  }, [target]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        stopSpeaking();
      };
    }, []),
  );

  const running = !!perm?.granted && ready && focused && !paused;

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let id = 1;

    const loop = async () => {
      if (cancelled) return;
      const started = Date.now();
      let wait = INTERVAL_MS;
      try {
        setBusy(true);
        const pic = await cam.current?.takePictureAsync({ base64: true, quality: 0.4, skipProcessing: true, shutterSound: false });
        if (cancelled) return;
        if (!pic?.base64) throw new Error('No frame');
        const tgt = live.current.target;
        const r = await api<{ extracted: string; translated: string }>('/api/ai/ocr', {
          body: { image: pic.base64, mime: 'image/jpeg', target: tgt },
          timeoutMs: 30_000,
        });
        if (cancelled) return;
        setError(null);
        const key = `${tgt}|${norm(r.extracted)}`;
        if (r.extracted && key !== live.current.lastKey) {
          live.current.lastKey = key;
          setReading({ id: id++, original: r.extracted, translated: r.translated, target: tgt });
          Haptics.selectionAsync().catch(() => {});
        }
      } catch (e) {
        if (cancelled) return;
        setError(friendlyError(e));
        wait = ERROR_BACKOFF_MS;
      } finally {
        if (!cancelled) setBusy(false);
      }
      timer = setTimeout(loop, Math.max(0, wait - (Date.now() - started)));
    };
    timer = setTimeout(loop, 400);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [running]);

  const onReady = async () => {
    try {
      const sizes = (await cam.current?.getAvailablePictureSizesAsync()) ?? [];
      setSize(pickSize(sizes));
    } catch {
      // keep the default size
    }
    setReady(true);
  };

  if (!perm) return <View style={styles.black} />;
  if (!perm.granted) {
    return (
      <View style={[styles.black, styles.center, { padding: 24, gap: 18 }]}>
        <Animated.View entering={rise()} style={{ alignItems: 'center', gap: 16 }}>
          <View style={styles.permIcon}>
            <Icon name="camera-outline" size={40} color={C.greenDark} />
          </View>
          <T style={{ fontSize: 22, fontWeight: '700', textAlign: 'center' }}>{S.cameraPermission}</T>
          <Button label={S.allowCamera} icon="camera" big onPress={requestPerm} />
          <Button label={S.back} variant="outline" color={C.muted} onPress={() => router.back()} />
        </Animated.View>
      </View>
    );
  }

  const status = paused ? S.livePaused : reading ? null : S.liveScanning;

  return (
    <View style={styles.black}>
      <CameraView
        ref={cam}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={focused}
        enableTorch={torch}
        animateShutter={false}
        pictureSize={size}
        onCameraReady={onReady}
      />
      {/* Soft gradient-ish scrims so text stays readable over any scene */}
      <View pointerEvents="none" style={[styles.scrimTop, { height: insets.top + 120 }]} />
      <View pointerEvents="none" style={styles.scrimBottom} />

      <Reticle scanning={running} />

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" label={S.close} bg="rgba(0,0,0,0.45)" color={C.white} onPress={() => router.back()} />
        <View style={styles.statusPill}>
          <StatusDot on={running && busy} />
          <T style={styles.statusText} numberOfLines={1}>
            {paused ? S.livePaused : S.liveTranslate}
          </T>
        </View>
        <IconButton
          icon={torch ? 'flashlight' : 'flashlight-off'}
          label="Torch"
          bg={torch ? C.gold : 'rgba(0,0,0,0.45)'}
          color={torch ? C.bg : C.white}
          onPress={() => setTorch((t) => !t)}
        />
      </View>

      {/* Bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {LANGUAGES.map((l) => {
            const active = l.code === target;
            return (
              <PressableScale
                key={l.code}
                to={0.94}
                onPress={() => {
                  tap();
                  setTarget(l.code);
                }}
                style={[styles.lang, active && styles.langActive]}
              >
                <Text style={[styles.langText, active && { color: C.bg }]}>{l.native}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <View style={styles.card}>
          {reading ? (
            <Animated.View key={reading.id} entering={rise(0, 8)} exiting={fadeOut} style={{ gap: 10 }}>
              <ScrollView style={{ maxHeight: 220 }}>
                <Text style={styles.translated} selectable>
                  {showOriginal ? reading.original : reading.translated}
                </Text>
              </ScrollView>
              <View style={styles.actions}>
                <PressableScale to={0.95} onPress={() => setShowOriginal((v) => !v)} style={styles.toggle}>
                  <Icon name={showOriginal ? 'translate' : 'text-recognition'} size={18} color={C.muted} />
                  <T style={styles.toggleText}>{showOriginal ? S.liveTranslate : S.original}</T>
                </PressableScale>
                <View style={{ flex: 1 }} />
                {hasVoice(reading.target) ? (
                  <IconButton icon="volume-high" label={S.listen} size={48} onPress={() => speakRaw(reading.translated, reading.target)} />
                ) : null}
                <IconButton
                  icon={paused ? 'play' : 'pause'}
                  label={paused ? S.resume : S.pause}
                  size={48}
                  bg={paused ? C.green : C.raised}
                  color={paused ? C.white : C.text}
                  onPress={() => setPaused((p) => !p)}
                />
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={rise()} style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <T style={{ fontSize: 18, fontWeight: '600' }}>{status ?? S.liveScanning}</T>
              <T style={{ fontSize: 15, color: C.muted, textAlign: 'center' }}>{S.livePointAt}</T>
            </Animated.View>
          )}
          {error ? (
            <Animated.View entering={rise(0, 4)} exiting={fadeOut} style={styles.error}>
              <Icon name="wifi-alert" size={18} color={C.terracotta} />
              <T style={{ flex: 1, fontSize: 15, color: C.terracotta }}>{error}</T>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  permIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320, backgroundColor: 'rgba(0,0,0,0.35)' },
  reticle: { position: 'absolute', top: '22%', left: '10%', right: '10%', height: '30%' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusText: { fontSize: 15, fontWeight: '600', color: C.white, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12 },
  lang: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  langActive: { backgroundColor: C.greenDark, borderColor: C.greenDark },
  langText: { fontSize: 16, fontWeight: '600', color: C.white },
  card: { marginHorizontal: 12, backgroundColor: 'rgba(16,18,22,0.92)', borderRadius: 24, padding: 16, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  translated: { fontSize: 24, lineHeight: 34, fontWeight: '600', color: C.text },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: C.raised },
  toggleText: { fontSize: 14, color: C.muted, fontWeight: '600' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
