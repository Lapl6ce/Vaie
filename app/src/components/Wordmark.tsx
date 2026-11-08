import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, WORDMARK_FONT } from '../theme';

/** Simple "Vaie" wordmark with a sprouting leaf. Placeholder brand. */
export function Wordmark({ size = 40, light }: { size?: number; light?: boolean }) {
  const main = light ? C.white : C.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.1 }}>
      <View
        style={{
          width: size * 1.1,
          height: size * 1.1,
          borderRadius: size * 0.55,
          backgroundColor: light ? 'rgba(255,255,255,0.16)' : C.greenLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name="sprout" size={size * 0.75} color={light ? C.white : C.greenDark} />
      </View>
      <Text style={{ fontFamily: WORDMARK_FONT, fontSize: size, color: main, lineHeight: size * 1.3, includeFontPadding: false }}>
        Va<Text style={{ color: light ? C.goldDark : C.green }}>i</Text>e
      </Text>
    </View>
  );
}
