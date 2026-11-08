import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Text } from '../components/Text';
import { router } from 'expo-router';
import { C, shadow, SANS } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { LANGUAGES } from '../i18n/languages';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button, Icon, tap } from '../components/ui';
import { api } from '../lib/api';
import { useApp } from '../lib/AppState';
import type { Profile } from '../lib/types';
import { useVoiceScreen } from '../voice/VoiceProvider';

export default function Settings() {
  const { lang, setLang, profile, setProfile, serverUrl, updateServerUrl, serverStatus, adultLearn, setAdultLearn } = useApp();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [url, setUrl] = useState(serverUrl);
  const [test, setTest] = useState<null | boolean>(null);
  const [testing, setTesting] = useState(false);

  useVoiceScreen({ name: 'settings', read: () => [S.settings, S.language, S.switchProfile, S.serverAddress] });

  useEffect(() => {
    api<Profile[]>('/api/profiles').then(setProfiles).catch(() => {});
  }, []);

  const switchTo = async (p: Profile) => {
    tap();
    await setProfile(p);
    router.dismissAll();
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
      <ScreenHeader title={S.settings} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.h}>
            <Icon name="earth" size={26} color={C.gold} />
            <T style={styles.hText}>{S.language}</T>
          </View>
          <View style={styles.langs}>
            {LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => {
                  tap();
                  setLang(l.code); // takes effect immediately
                }}
                style={[styles.lang, l.code === lang && { backgroundColor: C.green, borderColor: C.green }]}
              >
                <Text style={[styles.langText, l.code === lang && { color: C.onAccent }]}>{l.native}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.h}>
            <Icon name="account-switch" size={26} color={C.green} />
            <T style={styles.hText}>{S.switchProfile}</T>
          </View>
          {profiles.map((p) => (
            <Pressable key={p.id} onPress={() => switchTo(p)} style={[styles.profile, p.id === profile?.id && { borderColor: C.green, backgroundColor: C.greenLight }]}>
              <Text style={{ fontSize: 32 }}>{p.avatar}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{p.name}</Text>
                <T style={{ fontSize: 15, color: C.muted }}>{p.mode === 'student' ? S.student : S.adult}</T>
              </View>
              {p.class ? <Text style={{ fontSize: 18, fontWeight: '800', color: C.muted }}>{p.class}</Text> : null}
              {p.id === profile?.id ? <Icon name="check-circle" size={28} color={C.green} /> : null}
            </Pressable>
          ))}
          <Button label={S.newProfile} icon="account-plus" variant="outline" onPress={() => router.push('/onboarding/role')} />
        </View>

        {profile?.mode === 'adult' ? (
          <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Icon name="map-marker-path" size={30} color={C.green} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '800', fontSize: 19 }}>{S.showLearning}</T>
              <T style={{ color: C.muted, fontSize: 15 }}>{S.showLearningDesc}</T>
            </View>
            <Switch value={adultLearn} onValueChange={setAdultLearn} trackColor={{ true: C.green }} style={{ transform: [{ scale: 1.3 }] }} />
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.h}>
            <Icon name="lan" size={26} color={C.blue} />
            <T style={styles.hText}>{S.serverAddress}</T>
          </View>
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
          <Button
            label={S.testConnection}
            icon="lan-connect"
            color={C.blue}
            loading={testing || serverStatus === 'checking'}
            onPress={async () => {
              setTesting(true);
              setTest(await updateServerUrl(url));
              setTesting(false);
            }}
          />
          {test !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={test ? 'check-circle' : 'close-circle'} size={24} color={test ? C.green : C.danger} />
              <T style={{ color: test ? C.green : C.danger, fontWeight: '800' }}>{test ? S.connected : S.notConnected}</T>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, gap: 12, ...shadow },
  h: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hText: { fontSize: 21, fontWeight: '900' },
  langs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lang: { minHeight: 52, paddingHorizontal: 14, borderRadius: 16, borderWidth: 2, borderColor: C.border, justifyContent: 'center', backgroundColor: C.bg },
  langText: { fontSize: 20, fontWeight: '800', color: C.text },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 64, borderRadius: 16, borderWidth: 2, borderColor: C.border },
  input: { minHeight: 56, borderWidth: 2, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, fontSize: 18, backgroundColor: C.bg, color: C.text, fontFamily: SANS.regular },
});
