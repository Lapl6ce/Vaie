import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C, shadow, SERIF } from '../../theme';
import { T } from '../../i18n/T';
import { S } from '../../i18n/strings';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button, ErrorBox, Icon, Loading, SpeakButton, type IconName } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import type { Unit } from '../../lib/types';
import { useVoice, useVoiceScreen } from '../../voice/VoiceProvider';
import { speak, stopSpeaking } from '../../voice/speaker';

/** Unit reader: mini-lesson + "Listen" + key idea + "Check understanding". */
export default function UnitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { speaking } = useVoice();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUnit(await api<Unit>(`/api/units/${id}`));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [id]);
  useEffect(() => {
    load();
    return () => stopSpeaking();
  }, [load]);

  const paragraphs = unit?.body.split(/\n\s*\n/).filter((p) => p.trim()) ?? [];
  const lessonTexts = unit ? [unit.title, ...paragraphs, S.keyIdea, unit.key_idea] : [];
  const startQuiz = () => {
    stopSpeaking();
    router.push({ pathname: '/quiz', params: { kind: 'unit', refId: id } });
  };

  useVoiceScreen({ name: 'unit', read: () => lessonTexts, onStartQuiz: startQuiz });

  if (error) return <View style={{ flex: 1 }}><ScreenHeader title={S.tabLearn} back /><ErrorBox message={error} onRetry={load} /></View>;
  if (!unit) return <View style={{ flex: 1 }}><ScreenHeader title={S.tabLearn} back /><Loading /></View>;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={unit.chapter_title} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 140 }}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name={(unit.icon as IconName) || 'book-open-variant'} size={44} color={C.onAccent} />
          </View>
          <T style={styles.title}>{unit.title}</T>
        </View>

        <Button
          label={speaking ? S.stop : S.listenLesson}
          icon={speaking ? 'stop-circle' : 'headphones'}
          color={speaking ? C.terracotta : C.blue}
          big
          onPress={() => (speaking ? stopSpeaking() : speak(lessonTexts))}
        />

        <View style={styles.card}>
          {paragraphs.map((p, i) => (
            <T key={i} style={styles.para} selectable>
              {p}
            </T>
          ))}
        </View>

        <View style={styles.keyIdea}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="lightbulb-on" size={32} color={C.goldDark} />
            <T style={styles.keyTitle}>{S.keyIdea}</T>
            <View style={{ flex: 1 }} />
            <SpeakButton text={unit.key_idea} color={C.goldDark} />
          </View>
          <T style={styles.keyText}>{unit.key_idea}</T>
        </View>

        <T style={{ color: C.muted, fontSize: 15, textAlign: 'center' }}>{S.cbseDemo}</T>
        <Button label={S.checkUnderstanding} icon="checkbox-marked-circle-outline" color={C.gold} big onPress={startQuiz} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 10 },
  heroIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', ...shadow },
  title: { fontSize: 30, fontFamily: SERIF, textAlign: 'center', color: C.text },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, gap: 14, ...shadow },
  para: { fontSize: 20, lineHeight: 31, color: C.text },
  keyIdea: { backgroundColor: C.goldLight, borderRadius: 20, padding: 16, gap: 8, borderWidth: 2, borderColor: C.gold },
  keyTitle: { fontSize: 22, fontWeight: '900', color: C.goldDark },
  keyText: { fontSize: 21, lineHeight: 30, fontWeight: '700', color: C.text },
});
