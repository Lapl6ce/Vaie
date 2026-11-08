/**
 * End-of-quiz "battle results" sequence, in the spirit of a classic RPG victory screen:
 * banner → battle report window → score → stars → EXP counts up → level bar fills
 * (and rolls over on level-up) → items obtained. Every beat has a light haptic tick.
 * Tap anywhere to skip to the end. Motion stays calm: fades, small rises, no bounce.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import * as Haptics from 'expo-haptics';
import { interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { C, WORDMARK_FONT } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import type { QuizResult } from '../lib/types';
import type { Boss } from '../lib/bosses';
import { Icon, type IconName } from './ui';
import { Animated, EASE, rise, settle } from './motion';

// Beat timeline (ms from mount). Index = phase number.
const BEATS = [0, 700, 1100, 1500, 2300, 3300, 4300, 4900];
const P = { banner: 0, window: 1, score: 2, stars: 3, exp: 4, level: 5, loot: 6, done: 7 };

const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
const levelStartOf = (n: number) => 50 * n * (n - 1);

/** Counts from 0 to `to` over `ms` once `active` is true. Jumps straight to the end when `instant`. */
function useCountUp(to: number, active: boolean, instant: boolean, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active || instant) return;
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, active, instant, ms]);
  return active && instant ? to : n;
}

function Banner({ won, boss }: { won: boolean; boss?: Boss }) {
  const color = won ? C.gold : C.terracotta;
  const label = boss ? (won ? S.bossDown : S.bossWon) : won ? S.victory : S.regroup;
  const line = useSharedValue(0);
  useEffect(() => {
    line.set(withDelay(150, withTiming(1, { duration: 700, easing: EASE })));
  }, [line]);
  const lineStyle = useAnimatedStyle(() => ({ opacity: line.get(), transform: [{ scaleX: line.get() }] }));
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      {boss ? (
        <Animated.View entering={settle(0)} style={[styles.bossShot, won && { transform: [{ rotate: '-18deg' }] }]}>
          <Text style={[styles.bossEmoji, won && { opacity: 0.45 }]}>{boss.emoji}</Text>
          {won ? (
            <View style={styles.bossCrown}>
              <Icon name="crown" size={18} color={C.onAccent} />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      <View style={styles.banner}>
        <Animated.View style={[styles.bannerLine, { backgroundColor: color }, lineStyle]} />
        <Animated.View entering={settle(boss ? 200 : 0)} style={{ flexShrink: 1 }}>
          <T style={[styles.bannerText, boss && styles.bannerTextBoss, { color }]}>{label}</T>
        </Animated.View>
        <Animated.View style={[styles.bannerLine, { backgroundColor: color }, lineStyle]} />
      </View>
    </View>
  );
}

function Star({ on, i }: { on: boolean; i: number }) {
  return (
    <Animated.View entering={settle(i * 220)}>
      <Icon name={on ? 'star' : 'star-outline'} size={44} color={on ? C.gold : C.locked} />
    </Animated.View>
  );
}

function Row({ label, children, i = 0 }: { label: string; children: React.ReactNode; i?: number }) {
  return (
    <Animated.View entering={rise(i * 80, 6)} style={styles.row}>
      <T style={styles.rowLabel}>{label}</T>
      <View style={styles.dots} />
      {children}
    </Animated.View>
  );
}

function LevelBar({ result, active, instant, onLevelUp }: { result: QuizResult; active: boolean; instant: boolean; onLevelUp: () => void }) {
  const { level, leveledUp, levelBefore, xpGained } = result;
  const xpBefore = level.xp - xpGained;
  const beforeStart = levelStartOf(levelBefore);
  const beforeNext = levelStartOf(levelBefore + 1);
  const from = leveledUp ? Math.max(0, Math.min(1, (xpBefore - beforeStart) / Math.max(1, beforeNext - beforeStart))) : Math.max(0, Math.min(1, (xpBefore - level.levelStart) / Math.max(1, level.nextLevelAt - level.levelStart)));
  const to = level.progress;
  const v = useSharedValue(from);
  const fired = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (instant) {
      v.set(to);
      if (leveledUp && !fired.current) {
        fired.current = true;
        onLevelUp();
      }
      return;
    }
    if (leveledUp) {
      v.set(withSequence(withTiming(1, { duration: 650, easing: EASE }), withTiming(0, { duration: 0 }), withTiming(to, { duration: 600, easing: EASE })));
      const t = setTimeout(() => {
        if (!fired.current) {
          fired.current = true;
          onLevelUp();
        }
      }, 650);
      return () => clearTimeout(t);
    }
    v.set(withTiming(to, { duration: 800, easing: EASE }));
  }, [active, instant, leveledUp, to, v, onLevelUp]);

  const fill = useAnimatedStyle(() => ({ width: `${v.get() * 100}%` }));
  const sheen = useAnimatedStyle(() => ({ opacity: interpolate(v.get(), [0, 1], [0.15, 0.35]) }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, fill]}>
        <Animated.View style={[styles.barSheen, sheen]} />
      </Animated.View>
    </View>
  );
}

export function BattleResult({ result, boss, onDone }: { result: QuizResult; boss?: Boss; onDone?: () => void }) {
  const [phase, setPhase] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [lvlFlash, setLvlFlash] = useState(false);
  const won = result.passed;

  useEffect(() => {
    if (skipped) return;
    const timers = BEATS.slice(1).map((ms, i) =>
      setTimeout(() => {
        setPhase(i + 1);
        if (i + 1 !== P.done) tick();
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [skipped]);

  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (phase >= P.done) doneRef.current?.();
  }, [phase]);

  const skip = () => {
    if (phase >= P.done) return;
    setSkipped(true);
    setPhase(P.done);
  };

  const exp = useCountUp(result.xpGained, phase >= P.exp, skipped);
  const score = useCountUp(result.correct, phase >= P.score, skipped, 500);
  const onLevelUp = React.useCallback(() => {
    setLvlFlash(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const loot: { icon: IconName; label: string; value: string; color: string }[] = [];
  if (won && result.unlocked) loot.push({ icon: 'map-marker-check', label: S.newAreaUnlocked, value: result.unlocked, color: C.greenDark });
  result.newBadges.forEach((b) => loot.push({ icon: (b.icon as IconName) || 'medal', label: S.newBadge, value: b.title, color: C.goldDark }));
  if (result.streak.activeToday && result.streak.current > 0)
    loot.push({ icon: 'fire', label: S.streakKept, value: `${result.streak.current}`, color: C.terracotta });

  const shownLevel = result.leveledUp && !lvlFlash ? result.levelBefore : result.level.level;

  return (
    <Pressable onPress={skip} style={{ gap: 18 }}>
      <Banner won={won} boss={boss} />

      {phase >= P.window ? (
        <Animated.View entering={rise(0, 12)} style={styles.window}>
          <View style={styles.windowInner}>
            <T style={styles.windowTitle}>{S.battleReport}</T>

            {phase >= P.score ? (
              <Row label={S.correctAnswers}>
                <Text style={styles.value}>
                  {score}
                  <Text style={styles.valueMuted}> / {result.total}</Text>
                </Text>
              </Row>
            ) : null}

            {phase >= P.stars ? (
              <View style={styles.stars}>
                {[1, 2, 3].map((i) => (
                  <Star key={i} i={skipped ? 0 : i - 1} on={won && i <= result.stars} />
                ))}
              </View>
            ) : null}

            {phase >= P.exp ? (
              <>
                <Row label={S.expGained}>
                  <Text style={[styles.value, { color: C.goldDark }]}>+{exp}</Text>
                </Row>
                {result.breakdown
                  .filter((b) => b.xp > 0)
                  .map((b, i) => (
                    <Animated.View key={b.label} entering={rise(skipped ? 0 : 200 + i * 120, 4)} style={styles.subRow}>
                      <T style={styles.subLabel}>{b.label}</T>
                      <Text style={styles.subValue}>+{b.xp}</Text>
                    </Animated.View>
                  ))}
              </>
            ) : null}

            {phase >= P.level ? (
              <Animated.View entering={rise(0, 6)} style={{ gap: 8, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T style={styles.rowLabel}>{S.level}</T>
                  <Text style={styles.levelNum}>{shownLevel}</Text>
                  <View style={{ flex: 1 }} />
                  {lvlFlash ? (
                    <Animated.View entering={settle()} style={styles.lvlUp}>
                      <Icon name="arrow-up-bold" size={16} color={C.bg} />
                      <T style={styles.lvlUpText}>{S.levelUp}</T>
                    </Animated.View>
                  ) : null}
                </View>
                <LevelBar result={result} active={phase >= P.level} instant={skipped} onLevelUp={onLevelUp} />
                <Text style={styles.valueMuted}>
                  {result.level.xp} / {result.level.nextLevelAt} XP
                </Text>
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
      ) : null}

      {phase >= P.loot && loot.length ? (
        <View style={{ gap: 10 }}>
          <Animated.View entering={rise(0, 6)}>
            <T style={styles.obtained}>{S.obtained}</T>
          </Animated.View>
          {loot.map((l, i) => (
            <Animated.View key={l.label + l.value} entering={rise(skipped ? 0 : 120 + i * 160, 8)} style={styles.lootRow}>
              <View style={[styles.lootIcon, { backgroundColor: l.color + '22' }]}>
                <Icon name={l.icon} size={26} color={l.color} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={styles.lootLabel}>{l.label}</T>
                <T style={styles.lootValue} numberOfLines={2}>
                  {l.value}
                </T>
              </View>
            </Animated.View>
          ))}
        </View>
      ) : null}

      {phase < P.done ? (
        <Animated.View entering={rise(400)} style={{ alignItems: 'center' }}>
          <T style={styles.skip}>{S.tapToSkip}</T>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bossShot: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  bossEmoji: { fontSize: 72, lineHeight: 88, textAlign: 'center' },
  bossCrown: { position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  bannerTextBoss: { fontSize: 34, lineHeight: 44, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 8 },
  bannerLine: { flex: 1, height: 1.5, borderRadius: 1 },
  bannerText: { fontFamily: WORDMARK_FONT, fontSize: 46, lineHeight: 58 },
  window: { borderRadius: 18, borderWidth: 1, borderColor: '#3A3F47', backgroundColor: '#101216', padding: 4 },
  windowInner: { borderRadius: 14, borderWidth: 1, borderColor: '#262A31', padding: 16, gap: 12 },
  windowTitle: { fontSize: 14, fontWeight: '700', color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 18, fontWeight: '600', color: C.text },
  dots: { flex: 1, height: 1, borderBottomWidth: 1, borderColor: '#2E3239', borderStyle: 'dashed', marginTop: 6 },
  value: { fontFamily: WORDMARK_FONT, fontSize: 28, lineHeight: 36, color: C.text },
  valueMuted: { fontSize: 15, color: C.muted, fontWeight: '600' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 4 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 12 },
  subLabel: { fontSize: 16, color: C.muted },
  subValue: { fontSize: 16, color: C.goldDark, fontWeight: '700' },
  levelNum: { fontFamily: WORDMARK_FONT, fontSize: 24, lineHeight: 32, color: C.greenDark },
  lvlUp: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenDark, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  lvlUpText: { fontSize: 14, fontWeight: '800', color: C.bg },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: C.border, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: C.green, overflow: 'hidden' },
  barSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#FFFFFF' },
  obtained: { fontSize: 14, fontWeight: '700', color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  lootRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.border },
  lootIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  lootLabel: { fontSize: 14, color: C.muted, fontWeight: '600' },
  lootValue: { fontSize: 18, color: C.text, fontWeight: '700' },
  skip: { fontSize: 14, color: C.muted },
});
