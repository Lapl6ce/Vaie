import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { C } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { RESOURCES } from '../config/resources';
import type { Category } from '../lib/types';
import { Button, Icon, SpeakButton, type IconName } from './ui';

/** "Where to get help" card for legal / financial / health / mental health / emergency questions. */
export function ResourceCard({ category }: { category: Category }) {
  const list = RESOURCES[category];
  if (!list?.length) return null;
  const urgent = category === 'emergency';
  return (
    <View style={[styles.wrap, urgent && { borderColor: C.danger, backgroundColor: C.dangerLight }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={urgent ? 'alert-octagon' : 'hand-heart'} size={30} color={urgent ? C.danger : C.blue} />
        <T style={[styles.h, urgent && { color: C.danger }]}>{S.whereToGetHelp}</T>
      </View>
      {list.map((r) => (
        <View key={r.title} style={styles.item}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={[styles.icon, { backgroundColor: r.color }]}>
              <Icon name={r.icon as IconName} size={28} color={C.white} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T style={{ fontSize: 19, fontWeight: '900' }}>{r.title}</T>
              <T style={{ color: C.muted }}>{r.body}</T>
            </View>
            <SpeakButton text={[r.title, r.body]} size={44} />
          </View>
          {r.phone ? (
            <Button
              label={S.call}
              icon="phone"
              color={r.color}
              onPress={() => Linking.openURL(`tel:${r.phone}`).catch(() => {})}
              style={{ marginTop: 8 }}
            />
          ) : null}
          {r.phone ? <Text style={styles.number}>{r.phone}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: C.blueLight, borderRadius: 22, padding: 14, gap: 10, borderWidth: 2, borderColor: C.blue },
  h: { fontSize: 21, fontWeight: '900', color: C.blue },
  item: { backgroundColor: C.card, borderRadius: 18, padding: 12 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  number: { textAlign: 'center', fontSize: 22, fontWeight: '900', marginTop: 4, letterSpacing: 2, color: C.text },
});
