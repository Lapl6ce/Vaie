import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, StyleProp, TextStyle, Easing } from 'react-native';
import { engine } from './engine';
import { C, S as Size } from '../theme';
import { fontFor } from '../components/Text';

let version = 0;
engine.subscribe(() => {
  version++;
});
const subscribe = (fn: () => void) => engine.subscribe(fn);
const getVersion = () => version;

/** Re-render whenever any translation arrives. */
export function useTrVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/** Returns a translator: tr("English") -> translated text (or English while loading / on failure). */
export function useTr() {
  useTrVersion();
  return (text: string) => {
    if (!text) return text;
    engine.request(text);
    return engine.get(text) ?? text;
  };
}

type Props = {
  children: string | number | (string | number)[];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
};

/**
 * <T>English text</T>: renders text in the user's language.
 * Shows a gentle shimmer while the translation loads and the original on failure.
 */
export function T({ children, style, numberOfLines, selectable }: Props) {
  useTrVersion();
  const text = Array.isArray(children) ? children.join('') : String(children ?? '');
  engine.request(text);
  const out = engine.get(text);
  const pending = out === undefined && engine.isPending(text);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pending) {
      opacity.stopAnimation();
      Animated.timing(opacity, { toValue: 1, duration: 280, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.75, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pending, opacity]);

  return (
    <Animated.Text
      style={[{ fontSize: Size.body, color: C.text }, style, fontFor(style), { opacity }]}
      numberOfLines={numberOfLines}
      selectable={selectable}
    >
      {out ?? text}
    </Animated.Text>
  );
}
