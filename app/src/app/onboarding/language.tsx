import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, shadow } from '../../theme';
import { LANGUAGES } from '../../i18n/languages';
import { useApp } from '../../lib/AppState';
import { Icon, IconButton, tap } from '../../components/ui';
import { Wordmark } from '../../components/Wordmark';
import { speakRaw } from '../../voice/speaker';
import { Appear, PressableScale } from '../../components/motion';

/** First launch: big buttons labelled in each language's own script, each with a speaker. */
export default function LanguagePicker() {
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { setLang, lang, profile } = useApp();

  const choose = async (code: string) => {
    tap();
    await setLang(code);
    if (from === 'settings' && router.canGoBack()) router.back();
    else if (profile) router.replace('/');
    else router.push('/onboarding/role');
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
      <Appear style={{ alignItems: 'center', gap: 14, marginTop: 12, marginBottom: 8 }}>
        <Wordmark size={52} />
        <View style={styles.globe}>
          <Icon name="translate" size={30} color={C.greenDark} />
        </View>
      </Appear>
      <View style={styles.grid}>
        {LANGUAGES.map((l, i) => {
          const active = l.code === lang;
          return (
            <Appear key={l.code} i={i + 2}>
            <PressableScale
              onPress={() => choose(l.code)}
              accessibilityLabel={l.english}
              style={[styles.btn, active && styles.active]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.native, active && { color: C.onAccent }]}>{l.native}</Text>
                {l.native !== l.english ? <Text style={[styles.english, active && { color: 'rgba(26,21,8,0.7)' }]}>{l.english}</Text> : null}
              </View>
              {l.voice ? (
                <IconButton icon="volume-high" label={l.english} size={48} onPress={() => speakRaw(l.native, l.code)} />
              ) : null}
            </PressableScale>
            </Appear>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 20 },
  globe: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center' },
  grid: { gap: 12 },
  btn: {
    ...shadow,
    minHeight: 76,
    borderRadius: 22,
    backgroundColor: C.card,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  active: { backgroundColor: C.green, borderColor: C.green },
  native: { fontSize: 28, fontWeight: '800', color: C.text },
  english: { fontSize: 16, color: C.muted },
});
