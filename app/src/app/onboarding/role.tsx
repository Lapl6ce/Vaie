import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { C, shadow, SERIF } from '../../theme';
import { T } from '../../i18n/T';
import { S } from '../../i18n/strings';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, IconName, tap } from '../../components/ui';
import { useVoiceScreen } from '../../voice/VoiceProvider';
import { Appear, PressableScale } from '../../components/motion';

function RoleCard({ icon, title, desc, color, onPress }: { icon: IconName; title: string; desc: string; color: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.card, { borderColor: color + '55' }]}
    >
      <View style={[styles.icon, { backgroundColor: color + '22' }]}>
        <Icon name={icon} size={56} color={color} />
      </View>
      <T style={styles.title}>{title}</T>
      <T style={styles.desc}>{desc}</T>
    </PressableScale>
  );
}

export default function Role() {
  useVoiceScreen({ name: 'role', read: () => [S.whoAreYou, S.student, S.studentDesc, S.adult, S.adultDesc] });
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={S.whoAreYou} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
        <Appear i={0}>
        <RoleCard
          icon="school"
          title={S.student}
          desc={S.studentDesc}
          color={C.gold}
          onPress={() => router.push({ pathname: '/onboarding/profile', params: { mode: 'student' } })}
        />
        </Appear>
        <Appear i={1}>
        <RoleCard
          icon="hand-heart"
          title={S.adult}
          desc={S.adultDesc}
          color={C.green}
          onPress={() => router.push({ pathname: '/onboarding/profile', params: { mode: 'adult' } })}
        />
        </Appear>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 28, padding: 24, alignItems: 'center', gap: 10, ...shadow, borderWidth: 1.5 },
  icon: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontFamily: SERIF, color: C.text, textAlign: 'center' },
  desc: { fontSize: 19, color: C.muted, textAlign: 'center' },
});
