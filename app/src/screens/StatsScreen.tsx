import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { C, shadow, WORDMARK_FONT, SERIF } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAnimatedStyle } from 'react-native-reanimated';
import { Animated, rise, useEased } from '../components/motion';
import { ErrorBox, Icon, Loading, ProgressBar, type IconName } from '../components/ui';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import type { Badge, LevelInfo, StreakInfo } from '../lib/types';
import { useVoiceScreen } from '../voice/VoiceProvider';
import { dayLabel } from '../components/Week';

type Stats = {
  level: LevelInfo;
  streak: StreakInfo;
  accuracy: { subject: string; pct: number; quizzes: number }[];
  unitsDone: number;
  unitsTotal: number;
  history: { kind: string; title: string; subject: string; correct: number; total: number; passed: number; xp: number; created_at: number }[];
  last7: { day: string; xp: number }[];
  badges: (Badge & { earned: boolean })[];
};

function Tile({ icon, color, value, label, onPress }: { icon: IconName; color: string; value: string | number; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tile]}>
      <Icon name={icon} size={36} color={color} />
      <Text style={[styles.tileNum, { color }]}>{value}</Text>
      <T style={styles.tileLabel}>{label}</T>
    </Pressable>
  );
}

function Bar({ h, i, color }: { h: number; i: number; color: string }) {
  const v = useEased(h, 200 + i * 50);
  const style = useAnimatedStyle(() => ({ height: v.get() }));
  return <Animated.View style={[{ backgroundColor: color, borderRadius: 8 }, style]} />;
}

function XpBars({ data }: { data: { day: string; xp: number }[] }) {
  const max = Math.max(50, ...data.map((d) => d.xp));
  return (
    <View style={styles.bars}>
      {data.map((d, i) => {
        const today = i === data.length - 1;
        return (
          <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.goldDark }}>{d.xp || ''}</Text>
            <View style={{ height: 140, justifyContent: 'flex-end', width: '70%' }}>
              <Bar h={Math.max(6, (d.xp / max) * 140)} i={i} color={today ? C.gold : d.xp ? C.green : C.border} />
            </View>
            <T style={{ fontSize: 13, color: today ? C.text : C.muted, fontWeight: today ? '900' : '600' }} numberOfLines={1}>
              {dayLabel(d.day)}
            </T>
          </View>
        );
      })}
    </View>
  );
}

export default function StatsScreen() {
  const { profile } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setStats(await api<Stats>(`/api/stats?profileId=${profile.id}`));
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [profile]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useVoiceScreen({
    name: 'stats',
    read: () =>
      stats
        ? [
            `${S.totalXp}: ${stats.level.xp}`,
            `${S.level}: ${stats.level.level}`,
            `${S.currentStreak}: ${stats.streak.current} ${S.days}`,
            `${S.unitsDone}: ${stats.unitsDone} ${S.of} ${stats.unitsTotal}`,
            ...stats.accuracy.map((a) => `${a.subject === 'Science' ? S.science : S.mathematics} ${S.accuracy}: ${a.pct}%`),
          ]
        : [],
  });

  if (error && !stats) return <View style={{ flex: 1 }}><ScreenHeader title={S.myStats} /><ErrorBox message={error} onRetry={load} /></View>;
  if (!stats) return <View style={{ flex: 1 }}><ScreenHeader title={S.myStats} /><Loading /></View>;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={S.myStats} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 160 }}>
        <Animated.View entering={rise(0)} style={styles.levelCard}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelNum}>{stats.level.level}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <T style={{ fontSize: 20, fontWeight: '900' }}>{S.level}</T>
            <ProgressBar value={stats.level.progress} height={18} />
            <Text style={{ color: C.muted, fontSize: 16, fontWeight: '700' }}>
              {stats.level.xp} / {stats.level.nextLevelAt} XP
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={rise(60)} style={styles.tiles}>
          <Tile icon="lightning-bolt" color={C.goldDark} value={stats.level.xp} label={S.totalXp} />
          <Tile icon="fire" color={C.terracotta} value={stats.streak.current} label={S.currentStreak} onPress={() => router.push('/streak')} />
          <Tile icon="trophy" color={C.gold} value={stats.streak.best} label={S.bestStreak} onPress={() => router.push('/streak')} />
          <Tile icon="book-check" color={C.green} value={`${stats.unitsDone}/${stats.unitsTotal}`} label={S.unitsDone} />
        </Animated.View>

        <Animated.View entering={rise(120)} style={styles.card}>
          <T style={styles.h}>{S.last7Days}</T>
          <XpBars data={stats.last7} />
        </Animated.View>

        <Animated.View entering={rise(180)} style={styles.card}>
          <T style={styles.h}>{S.accuracy}</T>
          {stats.accuracy.length === 0 ? <T style={{ color: C.muted }}>{S.noQuizzesYet}</T> : null}
          {stats.accuracy.map((a) => (
            <View key={a.subject} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={a.subject === 'Science' ? 'flask' : 'calculator-variant'} size={26} color={a.subject === 'Science' ? C.green : C.blue} />
                <T style={{ flex: 1, fontWeight: '800' }}>{a.subject === 'Science' ? S.science : S.mathematics}</T>
                <Text style={{ fontSize: 20, fontWeight: '900' }}>{a.pct}%</Text>
              </View>
              <ProgressBar value={a.pct / 100} color={a.subject === 'Science' ? C.green : C.blue} height={16} />
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={rise(240)} style={styles.card}>
          <T style={styles.h}>{S.badges}</T>
          <View style={styles.badges}>
            {stats.badges.map((b) => (
              <View key={b.id} style={[styles.badge, !b.earned && { opacity: 0.35 }]}>
                <View style={[styles.badgeIcon, { backgroundColor: b.earned ? C.goldLight : C.border }]}>
                  <Icon name={(b.earned ? b.icon : 'lock') as IconName} size={34} color={b.earned ? C.goldDark : C.muted} />
                </View>
                <T style={styles.badgeText} numberOfLines={2}>
                  {b.title}
                </T>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={rise(300)} style={styles.card}>
          <T style={styles.h}>{S.quizHistory}</T>
          {stats.history.length === 0 ? <T style={{ color: C.muted }}>{S.noQuizzesYet}</T> : null}
          {stats.history.map((h, i) => (
            <View key={i} style={styles.hist}>
              <Icon name={h.passed ? 'check-circle' : 'refresh-circle'} size={30} color={h.passed ? C.green : C.terracotta} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }} numberOfLines={1}>
                  {h.title}
                </T>
                <T style={{ fontSize: 15, color: C.muted }}>{h.passed ? S.passed : S.failed}</T>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900' }}>
                {h.correct}/{h.total}
              </Text>
              {h.xp ? <Text style={{ fontSize: 15, fontWeight: '800', color: C.goldDark }}>+{h.xp}</Text> : null}
            </View>
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: C.card, borderRadius: 22, ...shadow },
  levelBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  levelNum: { fontFamily: WORDMARK_FONT, fontSize: 36, color: C.bg, lineHeight: 46 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 20, padding: 14, alignItems: 'center', gap: 2, ...shadow },
  tileNum: { fontFamily: WORDMARK_FONT, fontSize: 32, lineHeight: 42 },
  tileLabel: { fontSize: 15, color: C.muted, textAlign: 'center', fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, gap: 12, ...shadow },
  h: { fontSize: 20, fontFamily: SERIF },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { width: '29%', alignItems: 'center', gap: 4 },
  badgeIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
