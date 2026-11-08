import React, { useCallback, useEffect, useState } from 'react';
import { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { Animated, PressableScale, rise, useBreath } from '../components/motion';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, shadow, WORDMARK_FONT, onColor } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { ScreenHeader } from '../components/ScreenHeader';
import { ErrorBox, Icon, Loading, Pill, ProgressBar, tap, type IconName } from '../components/ui';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import type { PathChapter } from '../lib/types';
import { useVoiceScreen } from '../voice/VoiceProvider';
import { RegionMap, type MapNode } from '../components/FantasyMap';
import { speak } from '../voice/speaker';

const W = Dimensions.get('window').width;

function Mascot({ text }: { text: string }) {
  const breath = useBreath(true, 3600);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(breath.get(), [0, 1], [0, -3]) }] }));
  return (
    <Animated.View entering={rise()} style={styles.mascotRow}>
      {/* Mascot placeholder: "Vaie the owl" */}
      <Animated.View style={[styles.mascot, float]}>
        <Icon name="owl" size={40} color={C.greenDark} />
      </Animated.View>
      <View style={styles.bubble}>
        <T style={{ fontSize: 18, fontWeight: '600', color: C.text }}>{text}</T>
      </View>
    </Animated.View>
  );
}

export default function LearnScreen() {
  const { profile, summary, refreshSummary } = useApp();
  const params = useLocalSearchParams<{ subject?: string; t?: string }>();
  const [subject, setSubject] = useState(params.subject === 'Mathematics' ? 'Mathematics' : 'Science');
  const [cls, setCls] = useState(profile?.class && profile.class <= 10 ? profile.class : profile?.class ?? 9);
  const [path, setPath] = useState<PathChapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.subject) setSubject(params.subject === 'Mathematics' ? 'Mathematics' : 'Science');
  }, [params.subject, params.t]);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      setPath(await api<PathChapter[]>(`/api/path?profileId=${profile.id}&class=${cls}&subject=${subject}`));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [profile, cls, subject]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshSummary();
    }, [load, refreshSummary]),
  );

  const currentUnit = path?.flatMap((c) => c.units).find((u) => u.status === 'current');

  useVoiceScreen({
    name: 'learn',
    read: () => [
      subject === 'Science' ? S.science : S.mathematics,
      ...(path?.map((c) => c.title) ?? []),
      currentUnit ? `${S.start_}: ${currentUnit.title}` : '',
    ].filter(Boolean),
    onStartQuiz: () => {
      if (currentUnit) router.push({ pathname: '/quiz', params: { kind: 'unit', refId: currentUnit.id } });
    },
  });

  const lockedTap = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    speak(S.finishPrevious);
  };

  const streak = summary?.streak.current ?? 0;
  const level = summary?.level;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={S.tabLearn}
        right={
          <Pressable onPress={() => router.push('/streak')} hitSlop={8}>
            <Pill icon="fire" text={streak} color={streak ? C.terracotta : C.muted} bg={streak ? C.terracottaLight : C.border} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {level ? (
          <PressableScale to={0.98} entering={rise()} onPress={() => router.push('/student/stats')} style={styles.levelCard}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelNum}>{level.level}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '800', fontSize: 18 }}>{S.level}</T>
                <Text style={{ fontWeight: '800', fontSize: 18, color: C.goldDark }}>
                  {level.xp} / {level.nextLevelAt} XP
                </Text>
              </View>
              <ProgressBar value={level.progress} />
            </View>
          </PressableScale>
        ) : null}

        <View style={styles.subjects}>
          {(['Science', 'Mathematics'] as const).map((s) => {
            const active = s === subject;
            return (
              <PressableScale
                key={s}
                to={0.96}
                onPress={() => {
                  tap();
                  setSubject(s);
                }}
                style={[styles.subject, active && { backgroundColor: s === 'Science' ? C.green : C.blue, borderColor: 'transparent' }]}
              >
                <Icon name={s === 'Science' ? 'flask' : 'calculator-variant'} size={34} color={active ? onColor(s === 'Science' ? C.green : C.blue) : C.muted} />
                <T style={[styles.subjectText, active && { color: onColor(s === 'Science' ? C.green : C.blue) }]}>{s === 'Science' ? S.science : S.mathematics}</T>
              </PressableScale>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
          {[8, 9, 10, 11, 12].map((c) => {
            const active = c === cls;
            return (
              <PressableScale
                key={c}
                to={0.94}
                onPress={() => {
                  tap();
                  setCls(c);
                }}
                style={[styles.classChip, active && { backgroundColor: C.gold, borderColor: C.gold }]}
              >
                <T style={[styles.classLabel, active && { color: C.bg }]}>{S.class}</T>
                <Text style={[styles.classNum, active && { color: C.bg }]}>{c}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <Mascot text={S.mascotHello} />

        {error ? <ErrorBox message={error} onRetry={load} /> : null}
        {!path && !error ? <View style={{ height: 300 }}><Loading /></View> : null}
        {path && path.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="hammer-wrench" size={64} color={C.gold} />
            <T style={{ fontSize: 24, fontWeight: '800' }}>{S.comingSoon}</T>
            <T style={{ textAlign: 'center', color: C.muted }}>{S.comingSoonDesc}</T>
          </View>
        ) : null}

        {path && path.length ? <T style={styles.mapNote}>{S.cbseDemo}</T> : null}
        {path?.map((ch, ci) => {
          const nodes: MapNode[] = [
            ...ch.units.map((u) => ({
              key: u.id,
              title: u.title,
              icon: (u.icon as IconName) || 'book-open-variant',
              status: u.status,
              stars: u.stars,
              onPress: () => (u.status === 'locked' ? lockedTap() : router.push(`/unit/${u.id}`)),
            })),
            {
              key: ch.id + '-test',
              title: S.chapterTest,
              icon: 'trophy' as IconName,
              status: ch.test.status,
              stars: 0,
              isTest: true,
              early: ch.test.early,
              // The chapter test is a game of Snakes & Ladders, and is always open (90% skips the module).
              onPress: () => router.push({ pathname: '/game', params: { chapterId: ch.id } }),
            },
          ];
          return (
            <RegionMap
              key={ch.id}
              chapterId={ch.id}
              chapterTitle={ch.title}
              locked={ch.locked}
              nodes={nodes}
              index={ci}
              width={W - 24}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginBottom: 12, padding: 14, backgroundColor: C.card, borderRadius: 20, ...shadow },
  levelBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  levelNum: { fontFamily: WORDMARK_FONT, fontSize: 28, color: C.bg, lineHeight: 36 },
  subjects: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  subject: {
    flex: 1,
    minHeight: 72,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
  },
  subjectText: { fontSize: 19, fontWeight: '800', color: C.text, flexShrink: 1 },
  classChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 52, paddingHorizontal: 16, borderRadius: 26, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  classLabel: { fontSize: 17, fontWeight: '700', color: C.text },
  classNum: { fontSize: 22, fontWeight: '900', color: C.text },
  mascotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginVertical: 14 },
  mascot: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', ...shadow },
  bubble: { flex: 1, backgroundColor: C.card, borderRadius: 18, borderTopLeftRadius: 4, padding: 12, ...shadow },
  empty: { alignItems: 'center', gap: 10, padding: 32 },
  mapNote: { fontSize: 13, color: C.faint, textAlign: 'center', marginTop: 4 },
});
