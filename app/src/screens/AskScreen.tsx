import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { Text } from '../components/Text';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { C, SANS, shadow, SERIF_REGULAR } from '../theme';
import { T, useTr } from '../i18n/T';
import { S } from '../i18n/strings';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button, Chip, Icon, IconButton, SpeakButton, tap, type IconName } from '../components/ui';
import { MicButton } from '../components/VoiceUI';
import { ResourceCard } from '../components/ResourceCard';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import type { Category } from '../lib/types';
import { useVoiceScreen } from '../voice/VoiceProvider';
import { Animated, PressableScale, rise, STAGGER } from '../components/motion';
import { speak, stopSpeaking } from '../voice/speaker';

type Msg =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'bot'; text: string; category: Category; topic: string; suggestions: string[] }
  | { id: number; role: 'error'; text: string; retry: string };

const TOPICS: { key: string; label: string; starter: string; icon: IconName; color: string }[] = [
  { key: 'Farming', label: S.topicFarming, starter: S.starterFarming, icon: 'sprout', color: '#8CC084' },
  { key: 'Fixing', label: S.topicFixing, starter: S.starterFixing, icon: 'wrench', color: '#C9A27E' },
  { key: 'Plumbing', label: S.topicPlumbing, starter: S.starterPlumbing, icon: 'pipe-leak', color: '#8FB3CF' },
  { key: 'Building', label: S.topicBuilding, starter: S.starterBuilding, icon: 'wall', color: '#E58A6B' },
  { key: 'Wiring', label: S.topicWiring, starter: S.starterWiring, icon: 'flash', color: '#E8C95F' },
  { key: 'Crafts', label: S.topicCrafts, starter: S.starterCrafts, icon: 'basket', color: '#D9B48A' },
  { key: 'Food', label: S.topicFood, starter: S.starterFood, icon: 'food-apple', color: '#F2555A' },
  { key: 'Everyday life', label: S.topicEveryday, starter: S.starterEveryday, icon: 'home-heart', color: '#7FBFB2' },
];
const topicMeta = (t: string) => TOPICS.find((x) => x.key === t);
const REDIRECT: Category[] = ['legal', 'financial', 'health', 'mental_health', 'emergency'];

let nextId = 1;

export default function AskScreen() {
  const { lang, profile } = useApp();
  const tr = useTr();
  const params = useLocalSearchParams<{ q?: string; t?: string }>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);
  const lastParam = useRef<string | undefined>(undefined);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;

  const send = useCallback(
    async (text: string, shown?: string) => {
      const q = text.trim();
      if (!q || busy) return;
      stopSpeaking();
      setInput('');
      const history = msgsRef.current
        .filter((m) => m.role !== 'error')
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));
      setMsgs((m) => [...m, { id: nextId++, role: 'user', text: shown ?? q }]);
      setBusy(true);
      try {
        const r = await api<{ category: Category; topic: string; reply: string; suggestions: string[] }>('/api/ai/assistant', {
          body: { text: q, lang, history },
          timeoutMs: 30_000,
        });
        setMsgs((m) => [...m, { id: nextId++, role: 'bot', text: r.reply, category: r.category, topic: r.topic, suggestions: (r.suggestions ?? []).slice(0, 3) }]);
        speak(r.reply); // auto-play in the user's language (falls back to text only)
      } catch (e) {
        const err = friendlyError(e);
        setMsgs((m) => [...m, { id: nextId++, role: 'error', text: err, retry: q }]);
        speak(err);
      } finally {
        setBusy(false);
      }
    },
    [busy, lang],
  );

  // A question routed here by a voice command ("ask_assistant").
  useEffect(() => {
    if (params.q && params.t !== lastParam.current) {
      lastParam.current = params.t;
      send(params.q);
    }
  }, [params.q, params.t, send]);

  useVoiceScreen({
    name: 'ask',
    read: () => {
      const lastBot = [...msgs].reverse().find((m) => m.role === 'bot');
      return lastBot ? [lastBot.text] : [S.askScope, S.tapToSpeak];
    },
    onAsk: (t) => send(t),
  });

  const empty = msgs.length === 0;

  const endChat = useCallback(() => {
    stopSpeaking();
    setInput('');
    setMsgs([]);
  }, []);

  // Android back button leaves the conversation first, then behaves normally.
  useFocusEffect(
    useCallback(() => {
      if (empty) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        endChat();
        return true;
      });
      return () => sub.remove();
    }, [empty, endChat]),
  );

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
      <ScreenHeader
        title={S.tabAsk}
        onClose={empty ? undefined : endChat}
      />
      <ScrollView
        ref={scroller}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.scope}>
          <Icon name="information-outline" size={24} color={C.greenDark} />
          <T style={{ flex: 1, color: C.greenDark, fontWeight: '700', fontSize: 17 }}>{S.askScope}</T>
        </View>

        {empty ? (
          <>
            <View style={styles.tiles}>
              {TOPICS.map((t, i) => (
                <PressableScale
                  key={t.key}
                  entering={rise(i * STAGGER)}
                  onPress={() => {
                    tap();
                    send(t.starter, tr(t.starter));
                  }}
                  to={0.96}
                  style={styles.tile}
                >
                  <View style={[styles.tileIcon, { backgroundColor: t.color + '22' }]}>
                    <Icon name={t.icon} size={34} color={t.color} />
                  </View>
                  <T style={styles.tileText}>{t.label}</T>
                </PressableScale>
              ))}
            </View>
            <View style={styles.bigMic}>
              <MicButton size={112} />
              <T style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{S.tapToSpeak}</T>
            </View>
            {profile?.mode === 'adult' ? (
              <Button label={S.translateTitle} icon="translate" variant="outline" color={C.blue} big onPress={() => router.navigate('/adult/translate')} />
            ) : null}
          </>
        ) : null}

        {msgs.map((m) => {
          if (m.role === 'user') {
            return (
              <Animated.View key={m.id} entering={rise(0, 8)} style={styles.userBubble}>
                <Text style={styles.userText}>{m.text}</Text>
              </Animated.View>
            );
          }
          if (m.role === 'error') {
            return (
              <Animated.View key={m.id} entering={rise(0, 8)} style={[styles.botBubble, { backgroundColor: C.dangerLight }]}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Icon name="emoticon-sad-outline" size={28} color={C.danger} />
                  <T style={{ flex: 1 }}>{m.text}</T>
                </View>
                <Button label={S.retry} icon="refresh" color={C.terracotta} onPress={() => send(m.retry)} />
              </Animated.View>
            );
          }
          const meta = topicMeta(m.topic);
          const redirect = REDIRECT.includes(m.category);
          return (
            <Animated.View key={m.id} entering={rise(60, 8)} style={{ gap: 8 }}>
              <View style={styles.botBubble}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {m.category === 'in_scope' && meta ? (
                    <View style={[styles.tag, { backgroundColor: meta.color + '26' }]}>
                      <Icon name={meta.icon} size={18} color={meta.color} />
                      <T style={{ color: meta.color, fontWeight: '700', fontSize: 15 }}>{meta.label}</T>
                    </View>
                  ) : m.category === 'in_scope' && m.topic && m.topic !== 'None' ? (
                    <View style={[styles.tag, { backgroundColor: C.blueLight }]}>
                      <T style={{ color: C.blue, fontWeight: '700', fontSize: 15 }}>{m.topic}</T>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <SpeakButton text={m.text} size={48} />
                </View>
                <T style={styles.botText} selectable>
                  {m.text}
                </T>
              </View>
              {redirect ? <ResourceCard category={m.category} /> : null}
              {m.category === 'in_scope' ? (
                <Button label={S.tellMeMore} icon="plus-circle-outline" variant="soft" onPress={() => send('Tell me more about that, with a few more simple steps.', tr(S.tellMeMore))} />
              ) : null}
              {m.suggestions.length ? (
                <View style={styles.sugs}>
                  {m.suggestions.map((s) => (
                    <Chip key={s} label={s} icon="help-circle-outline" onPress={() => send(s, tr(s))} />
                  ))}
                </View>
              ) : null}
            </Animated.View>
          );
        })}
        {busy ? (
          <View style={[styles.botBubble, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <ActivityIndicator color={C.green} />
            <T style={{ color: C.muted }}>{S.thinking}</T>
          </View>
        ) : null}
      </ScrollView>

      {/* Input bar. Right padding leaves room for the floating mic. */}
      <View style={styles.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={tr(S.askPlaceholder)}
          style={styles.input}
          multiline
          onSubmitEditing={() => send(input)}
        />
        <IconButton icon="send" label={S.askPlaceholder} bg={C.green} color={C.onAccent} onPress={() => send(input)} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scope: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.greenLight, padding: 12, borderRadius: 16 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', flexGrow: 1, minHeight: 120, backgroundColor: C.card, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, ...shadow },
  tileIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  bigMic: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: C.raised, borderRadius: 20, borderBottomRightRadius: 4, padding: 14 },
  userText: { color: C.text, fontSize: 19 },
  botBubble: { alignSelf: 'stretch', backgroundColor: C.card, borderRadius: 20, borderBottomLeftRadius: 4, padding: 14, gap: 8, ...shadow },
  botText: { fontSize: 20, lineHeight: 31, color: C.text, fontFamily: SERIF_REGULAR },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  sugs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingRight: 96, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  input: { flex: 1, minHeight: 56, maxHeight: 120, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 19, backgroundColor: C.bg, color: C.text, fontFamily: SANS.regular },
});
