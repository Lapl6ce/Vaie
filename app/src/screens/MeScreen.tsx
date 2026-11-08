import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { C, shadow, WORDMARK_FONT } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { langByCode } from '../i18n/languages';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon, ProgressBar, tap, type IconName } from '../components/ui';
import { Wordmark } from '../components/Wordmark';
import { useApp } from '../lib/AppState';
import { useVoiceScreen } from '../voice/VoiceProvider';
import { PressableScale } from '../components/motion';

function Row({ icon, label, value, color = C.green, onPress }: { icon: IconName; label: string; value?: string; color?: string; onPress: () => void }) {
  return (
    <PressableScale
      to={0.98}
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.row}
    >
      <View style={[styles.rowIcon, { backgroundColor: color + '22' }]}>
        <Icon name={icon} size={26} color={color} />
      </View>
      <T style={styles.rowText}>{label}</T>
      {value ? <Text style={{ fontSize: 18, color: C.muted, fontWeight: '700' }}>{value}</Text> : null}
      <Icon name="chevron-right" size={26} color={C.muted} />
    </PressableScale>
  );
}

export default function MeScreen() {
  const { profile, summary, lang, refreshSummary } = useApp();
  useFocusEffect(
    useCallback(() => {
      refreshSummary();
    }, [refreshSummary]),
  );
  const student = profile?.mode === 'student';
  useVoiceScreen({
    name: 'me',
    read: () => [profile?.name ?? '', student ? `${S.level} ${summary?.level.level ?? 1}` : S.adult, S.settings].filter(Boolean),
  });
  if (!profile) return null;
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={S.tabMe} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 160 }}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 56 }}>{profile.avatar}</Text>
          </View>
          <Text style={styles.name}>{profile.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <View style={styles.tag}>
              <Icon name={student ? 'school' : 'hand-heart'} size={20} color={C.greenDark} />
              <T style={styles.tagText}>{student ? S.student : S.adult}</T>
              {profile.class ? <Text style={styles.tagText}>· {profile.class}</Text> : null}
            </View>
            <View style={styles.tag}>
              <Icon name="home-group" size={20} color={C.greenDark} />
              <T style={styles.tagText}>{profile.village}</T>
            </View>
          </View>
          {student && summary ? (
            <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '900' }}>{S.level}</T>
                <Text style={{ fontFamily: WORDMARK_FONT, fontSize: 22, color: C.goldDark }}>
                  {summary.level.level} · {summary.level.xp} XP
                </Text>
              </View>
              <ProgressBar value={summary.level.progress} />
            </View>
          ) : null}
        </View>

        {student ? <Row icon="fire" label={S.myStreak} value={String(summary?.streak.current ?? 0)} color={C.terracotta} onPress={() => router.push('/streak')} /> : null}
        {student ? <Row icon="translate" label={S.translateTitle} color={C.blue} onPress={() => router.push('/translate')} /> : null}
        <Row icon="earth" label={S.language} value={langByCode(lang ?? 'en').native} color={C.gold} onPress={() => router.push({ pathname: '/onboarding/language', params: { from: 'settings' } })} />
        <Row icon="account-switch" label={S.switchProfile} color={C.green} onPress={() => router.push('/settings')} />
        <Row icon="cog" label={S.settings} color={C.muted} onPress={() => router.push('/settings')} />

        <View style={{ alignItems: 'center', marginTop: 16, gap: 4 }}>
          <Wordmark size={32} />
          <T style={{ color: C.muted, fontSize: 15 }}>{S.appTagline}</T>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 24, padding: 20, alignItems: 'center', gap: 8, ...shadow },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: C.goldLight, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.gold },
  name: { fontSize: 28, fontWeight: '900', color: C.text },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  tagText: { fontSize: 16, fontWeight: '800', color: C.greenDark },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 12, minHeight: 72, ...shadow },
  rowIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 20, fontWeight: '800', color: C.text },
});
