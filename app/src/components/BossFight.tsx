/**
 * Boss fight layer for chapter tests.
 *  - BossIntro: the boss appears with its taunt; "Fight!" starts the test.
 *  - BossBar:   boss HP (= correct answers still needed to pass) and your hearts
 *               (= mistakes you can still afford). A right answer is a strike: the boss
 *               flinches, flashes and loses HP. A wrong answer is its counter-attack:
 *               it lunges, a heart breaks, the screen edge flashes red.
 *  - HurtFlash: the red screen-edge flash (rendered once at screen level).
 * Motion stays short and eased; nothing bounces.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type EntryAnimationsValues,
} from 'react-native-reanimated';
import { C, SERIF } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import type { Boss } from '../lib/bosses';
import { Text } from './Text';
import { Button, Icon } from './ui';
import { Animated, EASE, rise, settle, useBreath } from './motion';

const OUT = { duration: 900, easing: Easing.out(Easing.cubic) };

/** "-1" that floats up and fades out. Config is inline so it is safe on the UI thread. */
function floatAway(_: EntryAnimationsValues) {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 0.9 }] },
    animations: {
      opacity: withDelay(250, withTiming(0, { duration: 650 })),
      transform: [{ translateY: withTiming(-34, OUT) }, { scale: withTiming(1.15, OUT) }],
    },
  };
}

export function BossIntro({ boss, onFight }: { boss: Boss; onFight: () => void }) {
  const breath = useBreath(true, 2400);
  const glow = useAnimatedStyle(() => ({
    opacity: interpolate(breath.get(), [0, 1], [0.2, 0.45]),
    transform: [{ scale: interpolate(breath.get(), [0, 1], [1, 1.18]) }],
  }));
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(breath.get(), [0, 1], [3, -4]) }] }));
  return (
    <View style={styles.intro}>
      <Animated.View entering={settle(100)} style={styles.introStage}>
        <Animated.View style={[styles.introGlow, { backgroundColor: boss.color }, glow]} />
        <View style={[styles.introRing, { borderColor: boss.color + '88' }]} />
        <Animated.View style={float}>
          <Text style={styles.introEmoji}>{boss.emoji}</Text>
        </Animated.View>
      </Animated.View>
      <Animated.View entering={rise(350)} style={{ alignItems: 'center', gap: 4 }}>
        <T style={[styles.introName, { color: boss.color }]}>{boss.name}</T>
        <T style={styles.introAppears}>{S.bossAppears}</T>
      </Animated.View>
      <Animated.View entering={rise(550)}>
        <T style={styles.taunt}>“{boss.taunt}”</T>
      </Animated.View>
      <Animated.View entering={rise(750)} style={styles.rules}>
        <Icon name="sword-cross" size={20} color={C.muted} />
        <T style={{ flex: 1, fontSize: 16, color: C.muted }}>{S.bossIntro}</T>
      </Animated.View>
      <Animated.View entering={rise(900)} style={{ alignSelf: 'stretch' }}>
        <Button label={S.fight} icon="sword" big color={boss.color} onPress={onFight} />
      </Animated.View>
    </View>
  );
}

export function BossBar({
  boss,
  hp,
  maxHp,
  hearts,
  maxHearts,
  hits,
  hurts,
}: {
  boss: Boss;
  hp: number;
  maxHp: number;
  hearts: number;
  maxHearts: number;
  /** Increments on every right answer (drives the strike animation). */
  hits: number;
  /** Increments on every wrong answer (drives the counter-attack animation). */
  hurts: number;
}) {
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const lunge = useSharedValue(0);
  const hpV = useSharedValue(maxHp ? hp / maxHp : 0);
  const down = hp <= 0;

  useEffect(() => {
    if (!hits) return;
    shake.set(withSequence(withTiming(-9, { duration: 50 }), withTiming(8, { duration: 70 }), withTiming(-5, { duration: 70 }), withTiming(0, { duration: 120, easing: EASE })));
    flash.set(withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 380, easing: EASE })));
  }, [hits, shake, flash]);

  useEffect(() => {
    if (!hurts) return;
    lunge.set(withSequence(withTiming(1, { duration: 140, easing: EASE }), withTiming(0, { duration: 420, easing: EASE })));
  }, [hurts, lunge]);

  useEffect(() => {
    hpV.set(withTiming(maxHp ? Math.max(0, hp) / maxHp : 0, { duration: 650, easing: EASE }));
  }, [hp, maxHp, hpV]);

  const bossStyle = useAnimatedStyle(() => ({
    opacity: down ? withTiming(0.35, { duration: 600 }) : 1,
    transform: [
      { translateX: shake.get() },
      { translateY: interpolate(lunge.get(), [0, 1], [0, 10]) },
      { scale: interpolate(lunge.get(), [0, 1], [1, 1.18]) },
      { rotate: down ? withTiming('-18deg', { duration: 600, easing: EASE }) : '0deg' },
    ],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() * 0.7 }));
  const hpStyle = useAnimatedStyle(() => ({ width: `${hpV.get() * 100}%` }));

  return (
    <Animated.View entering={rise()} style={[styles.bar, { borderColor: boss.color + '44' }]}>
      <View style={styles.bossRow}>
        <View style={styles.portrait}>
          <Animated.View style={bossStyle}>
            <Text style={styles.portraitEmoji}>{boss.emoji}</Text>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.portraitFlash, flashStyle]} />
          {hits ? (
            <Animated.View key={`hit-${hits}`} entering={floatAway} pointerEvents="none" style={styles.damage}>
              <Text style={styles.damageText}>−1</Text>
            </Animated.View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T style={[styles.bossName, { color: down ? C.muted : boss.color }]} numberOfLines={1}>
              {down ? S.bossDown : boss.name}
            </T>
            <View style={{ flex: 1 }} />
            <Text style={styles.hpText}>
              {Math.max(0, hp)}/{maxHp}
            </Text>
          </View>
          <View style={styles.hpTrack}>
            <Animated.View style={[styles.hpFill, { backgroundColor: boss.color }, hpStyle]} />
          </View>
          <View style={styles.hearts}>
            {Array.from({ length: maxHearts }).map((_, i) => {
              const alive = i < hearts;
              return (
                <Animated.View key={`${i}-${alive ? 'on' : 'off'}`} entering={alive ? undefined : settle()}>
                  <Icon name={alive ? 'heart' : 'heart-broken'} size={20} color={alive ? C.danger : C.locked} />
                </Animated.View>
              );
            })}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/** Red flash around the screen edges when the boss strikes back. Render at screen level. */
export function HurtFlash({ hurts }: { hurts: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!hurts) return;
    v.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 520, easing: EASE })));
  }, [hurts, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.get() }));
  return <Animated.View pointerEvents="none" style={[styles.hurt, style]} />;
}

const styles = StyleSheet.create({
  intro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  introStage: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  introGlow: { position: 'absolute', width: 170, height: 170, borderRadius: 85 },
  introRing: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderStyle: 'dashed' },
  introEmoji: { fontSize: 104, lineHeight: 124, textAlign: 'center' },
  introName: { fontFamily: SERIF, fontSize: 32, textAlign: 'center' },
  introAppears: { fontSize: 18, color: C.text, textAlign: 'center' },
  taunt: { fontFamily: SERIF, fontSize: 19, color: C.muted, textAlign: 'center', fontStyle: 'italic' },
  rules: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  bar: { marginHorizontal: 16, marginBottom: 8, backgroundColor: C.card, borderRadius: 18, padding: 12, borderWidth: 1 },
  bossRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  portrait: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1F1512', alignItems: 'center', justifyContent: 'center' },
  portraitEmoji: { fontSize: 40, lineHeight: 50, textAlign: 'center' },
  portraitFlash: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF' },
  damage: { position: 'absolute', top: -6, right: -10 },
  damageText: { fontFamily: SERIF, fontSize: 22, color: C.gold },
  bossName: { fontFamily: SERIF, fontSize: 18, flexShrink: 1 },
  hpText: { fontSize: 13, color: C.muted, fontWeight: '600' },
  hpTrack: { height: 8, borderRadius: 4, backgroundColor: C.border, overflow: 'hidden' },
  hpFill: { height: 8, borderRadius: 4 },
  hearts: { flexDirection: 'row', gap: 4 },
  hurt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 14, borderColor: 'rgba(242,85,90,0.55)' },
});
