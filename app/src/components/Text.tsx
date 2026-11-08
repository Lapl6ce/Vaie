/**
 * Drop-in replacement for React Native's <Text> that applies the app typeface.
 * Custom fonts on Android need one family per weight, so `fontWeight` is mapped to the matching
 * Instrument Sans file. A style that sets its own `fontFamily` (e.g. the serif) is left alone.
 */
import React from 'react';
import { Text as RNText, StyleSheet, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { SANS } from '../theme';

export function fontFor(style: StyleProp<TextStyle>): TextStyle | null {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return null;
  const w = String(flat.fontWeight ?? '400');
  const family =
    w === 'bold' || Number(w) >= 700 ? SANS.bold : w === '600' ? SANS.semibold : w === '500' ? SANS.medium : SANS.regular;
  return { fontFamily: family, fontWeight: 'normal' };
}

export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[style, fontFor(style)]} />;
}
