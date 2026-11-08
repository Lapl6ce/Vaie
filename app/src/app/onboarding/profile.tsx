import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S as Size, shadow, SANS } from '../../theme';
import { T, useTr } from '../../i18n/T';
import { S } from '../../i18n/strings';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button, Icon, tap } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import { useApp } from '../../lib/AppState';
import type { Mode, Profile } from '../../lib/types';
import { useVoiceScreen } from '../../voice/VoiceProvider';

const AVATARS = ['🦁', '🐯', '🐘', '🦚', '🐄', '🐐', '🦜', '🐢', '🦋', '🌻', '🐟', '🦅', '🐒', '🐂', '🌸', '🐓'];

export default function ProfileSetup() {
  const insets = useSafeAreaInsets();
  const tr = useTr();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: Mode }>();
  const mode: Mode = modeParam === 'adult' ? 'adult' : 'student';
  const { setProfile, lang } = useApp();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [cls, setCls] = useState(9);
  const [village, setVillage] = useState('Rampur');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Profile[]>([]);

  useVoiceScreen({ name: 'profile', read: () => [S.yourName, S.pickAvatar, mode === 'student' ? S.yourClass : '', S.yourVillage].filter(Boolean) });

  useEffect(() => {
    api<Profile[]>('/api/profiles')
      .then((ps) => setExisting(ps.filter((p) => p.mode === mode).slice(0, 6)))
      .catch(() => {});
  }, [mode]);

  const create = async () => {
    if (!name.trim()) {
      setError(S.typeYourName);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const p = await api<Profile>('/api/profiles', {
        body: { name: name.trim(), avatar, mode, class: mode === 'student' ? cls : null, village, language: lang },
      });
      await setProfile(p);
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const pick = async (p: Profile) => {
    tap();
    await setProfile(p);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={mode === 'student' ? S.student : S.adult} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <T style={styles.label}>{S.yourName}</T>
          <TextInput value={name} onChangeText={setName} placeholder={tr(S.typeYourName)} style={styles.input} maxLength={30} />
        </View>

        <View style={styles.section}>
          <T style={styles.label}>{S.pickAvatar}</T>
          <View style={styles.avatars}>
            {AVATARS.map((a) => (
              <Pressable
                key={a}
                onPress={() => {
                  tap();
                  setAvatar(a);
                }}
                style={[styles.avatar, a === avatar && styles.avatarActive]}
              >
                <Text style={{ fontSize: 36 }}>{a}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {mode === 'student' ? (
          <View style={styles.section}>
            <T style={styles.label}>{S.yourClass}</T>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {[8, 9, 10, 11, 12].map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    tap();
                    setCls(c);
                  }}
                  style={[styles.classBtn, c === cls && { backgroundColor: C.gold, borderColor: C.gold }]}
                >
                  <Text style={[styles.classText, c === cls && { color: C.bg }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <T style={styles.label}>{S.yourVillage}</T>
          <TextInput value={village} onChangeText={setVillage} style={styles.input} maxLength={30} />
        </View>

        {error ? <T style={{ color: C.danger, fontSize: Size.body, fontWeight: '700' }}>{error}</T> : null}
        <Button label={S.start} icon="arrow-right-bold-circle" big onPress={create} loading={saving} />

        {existing.length ? (
          <View style={[styles.section, { marginTop: 8 }]}>
            <T style={styles.label}>{S.orPickProfile}</T>
            {existing.map((p) => (
              <Pressable key={p.id} onPress={() => pick(p)} style={styles.existing}>
                <Text style={{ fontSize: 32 }}>{p.avatar}</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', flex: 1, color: C.text }}>{p.name}</Text>
                {p.class ? <Text style={{ fontSize: 16, color: C.muted }}>{p.class}</Text> : null}
                <Icon name="chevron-right" size={28} color={C.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  label: { fontSize: Size.large, fontWeight: '800', color: C.text },
  input: {
    minHeight: 60,
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 22,
    backgroundColor: C.card,
    color: C.text, fontFamily: SANS.regular,
  },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatar: { ...shadow, width: 64, height: 64, borderRadius: 32, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  avatarActive: { borderColor: C.gold, backgroundColor: C.goldLight },
  classBtn: { width: 64, height: 64, borderRadius: 18, borderWidth: 2, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  classText: { fontSize: 24, fontWeight: '900', color: C.text },
  existing: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 12, minHeight: 64, ...shadow },
});
