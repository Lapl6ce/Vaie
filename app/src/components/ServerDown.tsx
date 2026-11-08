import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S as Size } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { useApp } from '../lib/AppState';
import { Button, Icon, SpeakButton } from './ui';
import { Wordmark } from './Wordmark';

/** Full-screen "Can't reach Vaie town hall server" with retry and the server address editor. */
export function ServerDown() {
  const insets = useSafeAreaInsets();
  const { serverUrl, updateServerUrl, recheckServer, serverStatus } = useApp();
  const [url, setUrl] = useState(serverUrl);
  const checking = serverStatus === 'checking';
  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled">
        <Wordmark size={44} />
        <View style={styles.iconCircle}>
          <Icon name="home-city-outline" size={72} color={C.terracotta} />
          <View style={styles.badge}>
            <Icon name="wifi-off" size={28} color={C.white} />
          </View>
        </View>
        <T style={styles.title}>{S.serverDownTitle}</T>
        <T style={styles.body}>{S.serverDownBody}</T>
        <SpeakButton text={[S.serverDownTitle, S.serverDownBody]} />
        <Button label={S.retry} icon="refresh" big loading={checking} onPress={recheckServer} style={{ alignSelf: 'stretch' }} />
        <View style={styles.editor}>
          <T style={{ fontWeight: '800', color: C.muted }}>{S.serverAddress}</T>
          <TextInput
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.10:4000"
            style={styles.input}
          />
          <Button label={S.testConnection} icon="lan-connect" variant="outline" loading={checking} onPress={() => updateServerUrl(url)} />
          <Text style={styles.hint}>
            Laptop terminal shows: "Phone URL: http://…:4000"
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center', gap: 16 },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: C.terracottaLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  badge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: C.terracotta,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: Size.title, fontWeight: '900', textAlign: 'center', color: C.text },
  body: { fontSize: Size.body, textAlign: 'center', color: C.muted },
  editor: { alignSelf: 'stretch', gap: 10, marginTop: 16, padding: 16, backgroundColor: C.card, borderRadius: 20 },
  input: {
    minHeight: 56,
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 18,
    color: C.text,
    backgroundColor: C.bg,
  },
  hint: { color: C.muted, fontSize: 15 },
});
