/**
 * Translate tool: type, speak, paste, or photograph printed text (sign, medicine label, form,
 * English app screenshot). Photos: Gemini vision extracts the text on the server, then Sarvam translates.
 * NOTE: translating OTHER apps system-wide would need a native Android accessibility service
 * (not possible in Expo Go). This in-app tool is the demo substitute.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../components/Text';
import { router, usePathname } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { C, shadow, onColor, SANS } from '../theme';
import { T, useTr } from '../i18n/T';
import { S } from '../i18n/strings';
import { LANGUAGES, hasVoice, langByCode } from '../i18n/languages';
import { ScreenHeader } from '../components/ScreenHeader';
import { PressableScale } from '../components/motion';
import { ScreenTranslateCard } from '../components/ScreenTranslateCard';
import { Button, Icon, IconButton, tap, type IconName } from '../components/ui';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import { useVoice, useVoiceScreen } from '../voice/VoiceProvider';
import { speakRaw, stopSpeaking } from '../voice/speaker';

type Result = { original: string; translated: string; target: string; photo?: string };

function ToolButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <PressableScale
      to={0.95}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.tool, active && { backgroundColor: C.terracotta }]}
    >
      <Icon name={icon} size={36} color={active ? C.white : C.blue} />
      <T style={[styles.toolText, active && { color: C.white }]} numberOfLines={1}>
        {label}
      </T>
    </PressableScale>
  );
}

export default function TranslateScreen() {
  const { lang } = useApp();
  const pathname = usePathname();
  const tr = useTr();
  const voice = useVoice();
  const [target, setTarget] = useState(lang && lang !== 'en' ? lang : 'hi');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'text' | 'photo' | 'voice'>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useVoiceScreen({
    name: 'translate',
    readRaw: () => (result ? { text: result.translated, lang: result.target } : null),
    read: () => [S.translateTitle, S.translateHelp],
  });

  const say = (r: Result) => {
    if (hasVoice(r.target)) speakRaw(r.translated, r.target);
  };

  const translateText = async (input: string) => {
    const t = input.trim();
    if (!t) return;
    setBusy('text');
    setError(null);
    try {
      const r = await api<{ text: string }>('/api/translate/free', { body: { text: t, target }, timeoutMs: 30_000 });
      const res = { original: t, translated: r.text, target };
      setResult(res);
      setShowOriginal(false);
      say(res);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const fromPhoto = async (camera: boolean) => {
    setError(null);
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.5, allowsEditing: false };
      const pick = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (pick.canceled || !pick.assets?.[0]?.base64) return;
      const asset = pick.assets[0];
      setBusy('photo');
      setResult(null);
      const r = await api<{ extracted: string; translated: string }>('/api/ai/ocr', {
        body: { image: asset.base64, mime: asset.mimeType ?? 'image/jpeg', target },
        timeoutMs: 60_000,
      });
      if (!r.extracted) {
        setError(S.noTextFound);
        return;
      }
      const res = { original: r.extracted, translated: r.translated, target, photo: asset.uri };
      setResult(res);
      setShowOriginal(false);
      say(res);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const fromVoice = async () => {
    if (voice.state === 'listening') {
      voice.toggle(); // stop
      return;
    }
    setError(null);
    setBusy('voice');
    const heard = await voice.listenRaw(null); // auto-detect the spoken language
    setBusy(null);
    if (heard) {
      setText(heard);
      translateText(heard);
    }
  };

  const paste = async () => {
    const t = await Clipboard.getStringAsync().catch(() => '');
    if (t) {
      setText(t);
      translateText(t);
    }
  };

  const inTab = pathname.startsWith('/adult');

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
      <ScreenHeader title={S.translateTitle} back={!inTab} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <PressableScale to={0.98} onPress={() => { tap(); router.push('/live'); }} style={styles.live}>
          <View style={styles.liveIcon}>
            <Icon name="camera-iris" size={30} color={C.greenDark} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontSize: 20, fontWeight: '800' }}>{S.liveTranslate}</T>
            <T style={{ fontSize: 15, color: C.muted }}>{S.liveTranslateDesc}</T>
          </View>
          <Icon name="chevron-right" size={26} color={C.muted} />
        </PressableScale>

        <ScreenTranslateCard target={target} />

        <T style={{ color: C.muted }}>{S.translateHelp}</T>

        <View style={styles.tools}>
          <ToolButton icon="camera" label={S.takePhoto} onPress={() => fromPhoto(true)} />
          <ToolButton icon="image" label={S.pickPhoto} onPress={() => fromPhoto(false)} />
          <ToolButton icon={voice.state === 'listening' ? 'stop' : 'microphone'} label={S.speak} onPress={fromVoice} active={voice.state === 'listening'} />
          <ToolButton icon="content-paste" label={S.paste} onPress={paste} />
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={tr(S.typeOrPaste)}
          multiline
          style={styles.input}
        />

        <View style={{ gap: 6 }}>
          <T style={{ fontWeight: '800' }}>{S.translateTo}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => {
                  tap();
                  setTarget(l.code);
                }}
                style={[styles.lang, l.code === target && { backgroundColor: C.blue, borderColor: C.blue }]}
              >
                <Text style={[styles.langText, l.code === target && { color: onColor(C.blue) }]}>{l.native}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Button label={S.translateBtn} icon="translate" color={C.blue} big loading={busy === 'text'} onPress={() => translateText(text)} />

        {busy === 'photo' ? (
          <View style={styles.busy}>
            <ActivityIndicator size="large" color={C.blue} />
            <T style={{ fontSize: 20, fontWeight: '700' }}>{S.readingPhoto}</T>
          </View>
        ) : null}

        {error ? (
          <View style={styles.error}>
            <Icon name="alert-circle" size={28} color={C.danger} />
            <T style={{ flex: 1, color: C.danger, fontWeight: '700' }}>{error}</T>
          </View>
        ) : null}

        {result ? (
          <View style={styles.result}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.resultLang}>{langByCode(result.target).native}</Text>
              <View style={{ flex: 1 }} />
              {hasVoice(result.target) ? (
                <IconButton
                  icon={voice.speaking ? 'stop' : 'volume-high'}
                  label={S.listen}
                  size={64}
                  bg={voice.speaking ? C.terracotta : C.blue}
                  color={voice.speaking ? C.white : onColor(C.blue)}
                  onPress={() => (voice.speaking ? stopSpeaking() : say(result))}
                />
              ) : null}
            </View>
            <Text style={styles.resultText} selectable>
              {result.translated}
            </Text>
            {result.photo ? <Image source={{ uri: result.photo }} style={styles.photo} resizeMode="cover" /> : null}
            <Pressable onPress={() => setShowOriginal((v) => !v)} style={styles.origToggle}>
              <Icon name={showOriginal ? 'chevron-up' : 'chevron-down'} size={24} color={C.muted} />
              <T style={{ color: C.muted, fontWeight: '700' }}>{S.originalText}</T>
            </Pressable>
            {showOriginal ? (
              <Text style={styles.original} selectable>
                {result.original}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.note}>
          <Icon name="information-outline" size={20} color={C.muted} />
          <T style={{ flex: 1, color: C.muted, fontSize: 15 }}>{S.translateNote}</T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.green + '55' },
  liveIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: 10 },
  tool: { flex: 1, minHeight: 92, borderRadius: 20, backgroundColor: C.blueLight, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  toolText: { fontSize: 14, fontWeight: '800', color: C.blue, textAlign: 'center' },
  input: { minHeight: 110, borderRadius: 18, borderWidth: 2, borderColor: C.border, padding: 14, fontSize: 20, backgroundColor: C.card, color: C.text, fontFamily: SANS.regular, textAlignVertical: 'top' },
  lang: { minHeight: 52, paddingHorizontal: 16, borderRadius: 26, borderWidth: 2, borderColor: C.border, backgroundColor: C.card, justifyContent: 'center' },
  langText: { fontSize: 20, fontWeight: '800', color: C.text },
  busy: { alignItems: 'center', gap: 10, padding: 20 },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.dangerLight, padding: 14, borderRadius: 16 },
  result: { ...shadow, backgroundColor: C.card, borderRadius: 24, padding: 18, gap: 12, borderWidth: 3, borderColor: C.blue },
  resultLang: { fontSize: 18, fontWeight: '900', color: C.blue },
  resultText: { fontSize: 28, lineHeight: 42, fontWeight: '700', color: C.text },
  photo: { width: '100%', height: 160, borderRadius: 16 },
  origToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  original: { fontSize: 17, color: C.muted, lineHeight: 26 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 },
});
