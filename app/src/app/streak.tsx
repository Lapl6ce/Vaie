import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { useFocusEffect } from 'expo-router';
import { C, shadow, WORDMARK_FONT } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon, Loading } from '../components/ui';
import { WeekCalendar } from '../components/Week';
import { useApp } from '../lib/AppState';
import { useVoiceScreen } from '../voice/VoiceProvider';

export default function StreakScreen() {
  const { summary, refreshSummary } = useApp();
  useFocusEffect(
    useCallback(() => {
      refreshSummary();
    }, [refreshSummary]),
  );
  const s = summary?.streak;
  useVoiceScreen({
    name: 'streak',
    read: () => (s ? [`${S.currentStreak}: ${s.current} ${S.days}`, `${S.bestStreak}: ${s.best} ${S.days}`, s.activeToday ? S.learnedToday : S.learnToday, S.streakHelp] : []),
  });
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={S.streak} back />
      {!s ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}>
          <View style={styles.hero}>
            <Icon name="fire" size={140} color={s.current ? C.terracotta : C.locked} />
            <Text style={styles.big}>{s.current}</Text>
            <T style={{ fontSize: 22, fontWeight: '800', color: C.terracotta }}>{S.streakDay}</T>
            <T style={{ fontSize: 19, color: C.muted, textAlign: 'center' }}>{s.activeToday ? S.learnedToday : S.learnToday}</T>
          </View>
          <View style={styles.card}>
            <T style={styles.h}>{S.thisWeek}</T>
            <WeekCalendar streak={s} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
              <Icon name="trophy" size={36} color={C.gold} />
              <Text style={styles.num}>{s.best}</Text>
              <T style={{ color: C.muted, textAlign: 'center' }}>{S.bestStreak}</T>
            </View>
            <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
              <Icon name="snowflake" size={36} color={C.blue} />
              <Text style={styles.num}>{s.freezes}</Text>
              <T style={{ color: C.muted, textAlign: 'center' }}>{S.streakFreezes}</T>
            </View>
          </View>
          <View style={[styles.card, { flexDirection: 'row', gap: 10 }]}>
            <Icon name="information" size={26} color={C.blue} />
            <View style={{ flex: 1, gap: 6 }}>
              <T>{S.streakHelp}</T>
              <T style={{ color: C.muted }}>{S.freezeHelp}</T>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  big: { fontFamily: WORDMARK_FONT, fontSize: 72, color: C.terracotta, lineHeight: 86, marginTop: -20 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, gap: 10, ...shadow },
  h: { fontSize: 20, fontWeight: '900' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.border },
  num: { fontFamily: WORDMARK_FONT, fontSize: 40, color: C.text, lineHeight: 50 },
});
