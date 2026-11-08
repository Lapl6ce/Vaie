import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { C, shadow, WORDMARK_FONT } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { ScreenHeader } from '../components/ScreenHeader';
import { LinearTransition } from 'react-native-reanimated';
import { Animated, DUR, EASE, rise, STAGGER } from '../components/motion';
import { Button, Chip, ErrorBox, Icon, Loading } from '../components/ui';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import { useVoiceScreen } from '../voice/VoiceProvider';

type Row = { rank: number; id: string; name: string; avatar: string; village: string; class: number | null; xp: number; isMe: boolean; isDemoSeed: boolean };
type Board = { rows: Row[]; me: Row | null };

const POLL_MS = 5000; // live updates while the screen is open

function Podium({ rows }: { rows: Row[] }) {
  const order = [rows[1], rows[0], rows[2]];
  const heights = [96, 128, 76];
  const colors = ['#8E979F', C.gold, '#B9805A'];
  return (
    <View style={styles.podium}>
      {order.map((r, i) =>
        r ? (
          <Animated.View key={r.id} entering={rise([1, 0, 2][i] * 90, 16)} style={{ alignItems: 'center', flex: 1 }}>
            {i === 1 ? <Icon name="crown" size={34} color={C.gold} /> : null}
            <View style={[styles.podiumAvatar, r.isMe && { borderColor: C.green }]}>
              <Text style={{ fontSize: 34 }}>{r.avatar}</Text>
            </View>
            <T style={styles.podiumName} numberOfLines={1}>
              {r.name}
            </T>
            <Text style={styles.podiumXp}>{r.xp} XP</Text>
            <View style={[styles.block, { height: heights[i], backgroundColor: colors[i] }]}>
              <Text style={styles.blockRank}>{r.rank}</Text>
            </View>
          </Animated.View>
        ) : (
          <View key={i} style={{ flex: 1 }} />
        ),
      )}
    </View>
  );
}

export default function LeaderboardScreen() {
  const { profile } = useApp();
  const [scope, setScope] = useState<'all' | 'class' | 'village'>('class');
  const [subject, setSubject] = useState<string>('');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setBoard(await api<Board>(`/api/leaderboard?profileId=${profile.id}&scope=${scope}&subject=${subject}`));
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [profile, scope, subject]);

  useFocusEffect(
    useCallback(() => {
      load();
      timer.current = setInterval(load, POLL_MS);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }, [load]),
  );

  useVoiceScreen({
    name: 'leaderboard',
    read: () => {
      if (!board) return [];
      const top = board.rows.slice(0, 3).map((r) => `${r.rank}. ${r.name}, ${r.xp} XP`);
      return [S.weeklyLeaders, ...top, board.me ? `${S.yourRank}: ${board.me.rank}, ${board.me.xp} XP` : S.challengeBody];
    },
  });

  const rows = board?.rows ?? [];
  const showChallenge = board && (!board.me || board.me.xp === 0);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={S.weeklyLeaders} />
      <ScrollView contentContainerStyle={{ paddingBottom: 160, gap: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={S.myClass} icon="school" active={scope === 'class'} onPress={() => setScope('class')} />
          <Chip label={S.myVillage} icon="home-group" active={scope === 'village'} onPress={() => setScope('village')} />
          <Chip label={S.all} icon="earth" active={scope === 'all'} onPress={() => setScope('all')} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={S.allSubjects} active={!subject} onPress={() => setSubject('')} />
          <Chip label={S.science} icon="flask" active={subject === 'Science'} onPress={() => setSubject('Science')} />
          <Chip label={S.mathematics} icon="calculator-variant" active={subject === 'Mathematics'} onPress={() => setSubject('Mathematics')} />
        </ScrollView>

        {error && !board ? <ErrorBox message={error} onRetry={load} /> : null}
        {!board && !error ? <View style={{ height: 300 }}><Loading /></View> : null}

        {board ? (
          <>
            {rows.length ? <Podium rows={rows.slice(0, 3)} /> : null}
            {showChallenge ? (
              <View style={styles.challenge}>
                <Icon name="sword-cross" size={44} color={C.terracotta} />
                <View style={{ flex: 1, gap: 4 }}>
                  <T style={{ fontSize: 21, fontWeight: '900', color: C.terracotta }}>{S.challengeTitle}</T>
                  <T>{S.challengeBody}</T>
                </View>
              </View>
            ) : null}
            {showChallenge ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Button label={S.tabLearn} icon="map-marker-path" color={C.terracotta} onPress={() => router.navigate('/student/learn')} />
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {rows.slice(3).map((r, i) => (
                <Animated.View key={r.id} entering={rise(200 + Math.min(i, 10) * STAGGER)} layout={LinearTransition.duration(DUR.slow).easing(EASE)} style={[styles.row, r.isMe && styles.meRow]}>
                  <Text style={styles.rank}>{r.rank}</Text>
                  <Text style={{ fontSize: 30 }}>{r.avatar}</Text>
                  <View style={{ flex: 1 }}>
                    <T style={[styles.name, r.isMe && { color: C.greenDark }]} numberOfLines={1}>
                      {r.isMe ? `${r.name} (${S.you})` : r.name}
                    </T>
                    <T style={{ fontSize: 15, color: C.muted }}>{r.village}</T>
                  </View>
                  <Text style={styles.xp}>{r.xp}</Text>
                  <Icon name="lightning-bolt" size={20} color={C.goldDark} />
                </Animated.View>
              ))}
            </View>
            {board.me && board.me.rank <= 3 ? (
              <View style={[styles.row, styles.meRow, { marginHorizontal: 16 }]}>
                <Icon name="party-popper" size={28} color={C.green} />
                <T style={[styles.name, { flex: 1 }]}>{S.yourRank}</T>
                <Text style={styles.rank}>{board.me.rank}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingHorizontal: 16 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, gap: 8, marginTop: 8 },
  podiumAvatar: { ...shadow, width: 64, height: 64, borderRadius: 32, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.border },
  podiumName: { fontSize: 16, fontWeight: '800', marginTop: 4, maxWidth: 110 },
  podiumXp: { fontSize: 15, fontWeight: '800', color: C.goldDark },
  block: { alignSelf: 'stretch', borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  blockRank: { fontFamily: WORDMARK_FONT, fontSize: 34, color: C.onAccent, lineHeight: 44 },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, padding: 16, borderRadius: 20, backgroundColor: C.terracottaLight, borderWidth: 2, borderColor: C.terracotta, borderStyle: 'dashed' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, padding: 12, minHeight: 64, borderRadius: 18, ...shadow },
  meRow: { backgroundColor: C.greenLight, borderWidth: 3, borderColor: C.green },
  rank: { width: 34, fontSize: 22, fontWeight: '900', color: C.muted, textAlign: 'center' },
  name: { fontSize: 19, fontWeight: '800', color: C.text },
  xp: { fontSize: 20, fontWeight: '900', color: C.goldDark },
});
