/**
 * High-fantasy learning map. Each chapter is a realm: a framed piece of an old map with
 * ink-drawn scenery for its biome, a dotted trail (gold where you have already walked),
 * lesson waypoints, and the chapter test as a boss lair. Locked realms sit under fog.
 *
 * Scenery is deterministic per chapter (seeded), drawn with react-native-svg, and placed so it
 * never covers the trail, a waypoint or its label.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { C, SERIF, onColor } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { bossFor, seeded, type Biome } from '../lib/bosses';
import { Text } from './Text';
import { Icon, Stars, type IconName } from './ui';
import { Animated, PressableScale, rise, useBreath } from './motion';
import type { NodeStatus } from '../lib/types';

export type MapNode = {
  key: string;
  title: string;
  icon: IconName;
  status: NodeStatus;
  stars: number;
  onPress: () => void;
  isTest?: boolean;
  /** Test taken before the module is finished (90% to skip it). */
  early?: boolean;
};

const NODE = 76;
const LAIR = 108;
const ROW = 158;
const HEADER = 118;
const INK = '#A89A82';
const INK_SOFT = '#6A5F50';
const WATER = '#5FB8D8';
const TAG = 34; // space above each node for its tag
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const BIOME: Record<Biome, { tint: string; kinds: Kind[] }> = {
  fields: { tint: '#2A2511', kinds: ['wheat', 'wheat', 'wheat', 'hill', 'pine', 'grass'] },
  mountains: { tint: '#1A2130', kinds: ['mountain', 'mountain', 'rock', 'pine', 'rock'] },
  badlands: { tint: '#33190F', kinds: ['rock', 'mesa', 'mesa', 'grass', 'deadtree'] },
  crossroads: { tint: '#24261A', kinds: ['hill', 'pine', 'grass', 'hill', 'rock'] },
  marsh: { tint: '#0E2A27', kinds: ['reed', 'reed', 'wave', 'wave', 'deadtree'] },
  steppe: { tint: '#2A2A14', kinds: ['grass', 'grass', 'hill', 'hill', 'rock'] },
  crypt: { tint: '#1A2128', kinds: ['tomb', 'tomb', 'deadtree', 'rock', 'grass'] },
  forest: { tint: '#10291A', kinds: ['pine', 'pine', 'pine', 'pine', 'grass'] },
  peaks: { tint: '#14223A', kinds: ['mountain', 'mountain', 'mountain', 'pine'] },
  volcano: { tint: '#33130E', kinds: ['volcano', 'rock', 'rock', 'deadtree', 'mountain'] },
  coast: { tint: '#0B2633', kinds: ['wave', 'wave', 'wave', 'rock', 'grass'] },
  desert: { tint: '#33270F', kinds: ['dune', 'dune', 'pyramid', 'rock', 'dune'] },
};

type Kind = 'pine' | 'mountain' | 'hill' | 'wave' | 'reed' | 'grass' | 'tomb' | 'deadtree' | 'dune' | 'rock' | 'mesa' | 'volcano' | 'pyramid' | 'wheat';

/** One ink-drawn map glyph centred on (x, y), scaled by s. */
function Glyph({ kind, x, y, s, k }: { kind: Kind; x: number; y: number; s: number; k: number }) {
  const sw = 1.4;
  switch (kind) {
    case 'pine':
      return (
        <G key={k}>
          <Path d={`M${x} ${y - 20 * s} L${x + 8 * s} ${y - 6 * s} L${x - 8 * s} ${y - 6 * s} Z`} fill="#2F7A44" stroke="#5FB06E" strokeWidth={sw} strokeLinejoin="round" />
          <Path d={`M${x} ${y - 12 * s} L${x + 10 * s} ${y + 4 * s} L${x - 10 * s} ${y + 4 * s} Z`} fill="#3A8F52" stroke="#6CC27C" strokeWidth={sw} strokeLinejoin="round" />
          <Line x1={x} y1={y + 4 * s} x2={x} y2={y + 9 * s} stroke="#9A6B3E" strokeWidth={sw + 0.6} />
        </G>
      );
    case 'mountain':
      return (
        <G key={k}>
          <Path d={`M${x - 24 * s} ${y + 8 * s} L${x - 4 * s} ${y - 22 * s} L${x + 6 * s} ${y - 10 * s} L${x + 12 * s} ${y - 16 * s} L${x + 26 * s} ${y + 8 * s}`} fill="#4A5568" stroke="#8C9AB0" strokeWidth={sw} strokeLinejoin="round" />
          <Path d={`M${x - 10 * s} ${y - 13 * s} L${x - 4 * s} ${y - 22 * s} L${x + 1 * s} ${y - 15 * s}`} fill="#F2F4F7" stroke="#F2F4F7" strokeWidth={sw} strokeLinejoin="round" opacity={0.95} />
          <Line x1={x - 2 * s} y1={y - 6 * s} x2={x + 4 * s} y2={y + 6 * s} stroke={INK_SOFT} strokeWidth={1} />
          <Line x1={x + 4 * s} y1={y - 4 * s} x2={x + 10 * s} y2={y + 6 * s} stroke={INK_SOFT} strokeWidth={1} />
        </G>
      );
    case 'hill':
      return <Path key={k} d={`M${x - 20 * s} ${y + 4 * s} Q${x} ${y - 14 * s} ${x + 20 * s} ${y + 4 * s}`} fill="#3D6B35" stroke="#7DBB6A" strokeWidth={sw} strokeLinecap="round" />;
    case 'wave':
      return (
        <Path
          key={k}
          d={`M${x - 14 * s} ${y} q${3.5 * s} ${-4 * s} ${7 * s} 0 t${7 * s} 0 t${7 * s} 0 t${7 * s} 0`}
          fill="none"
          stroke={WATER}
          strokeWidth={sw}
          strokeLinecap="round"
          opacity={0.8}
        />
      );
    case 'reed':
      return (
        <G key={k}>
          {[-5, 0, 5].map((dx, i) => (
            <G key={i}>
              <Line x1={x + dx * s} y1={y + 6 * s} x2={x + dx * 1.4 * s} y2={y - (10 + (i % 2) * 5) * s} stroke="#6CC27C" strokeWidth={sw} strokeLinecap="round" />
              <Ellipse cx={x + dx * 1.4 * s} cy={y - (12 + (i % 2) * 5) * s} rx={1.6 * s} ry={3.4 * s} fill="#B5814A" />
            </G>
          ))}
          <Path d={`M${x - 10 * s} ${y + 7 * s} q${5 * s} ${-3 * s} ${10 * s} 0 t${10 * s} 0`} fill="none" stroke={WATER} strokeWidth={1.2} opacity={0.7} />
        </G>
      );
    case 'grass':
      return (
        <G key={k}>
          <Path d={`M${x - 5 * s} ${y} l${-2 * s} ${-7 * s} M${x} ${y} l0 ${-9 * s} M${x + 5 * s} ${y} l${2 * s} ${-7 * s}`} stroke="#8CC084" strokeWidth={1.4} strokeLinecap="round" />
        </G>
      );
    case 'wheat':
      return (
        <G key={k}>
          {[-6, 0, 6].map((dx, i) => (
            <G key={i}>
              <Line x1={x + dx * s} y1={y + 6 * s} x2={x + dx * s} y2={y - 10 * s} stroke="#E2B84A" strokeWidth={1.3} />
              <Ellipse cx={x + dx * s} cy={y - 12 * s} rx={2 * s} ry={4.5 * s} fill="#F0C75E" opacity={0.95} />
            </G>
          ))}
        </G>
      );
    case 'tomb':
      return (
        <G key={k}>
          <Path d={`M${x - 7 * s} ${y + 6 * s} L${x - 7 * s} ${y - 6 * s} Q${x - 7 * s} ${y - 13 * s} ${x} ${y - 13 * s} Q${x + 7 * s} ${y - 13 * s} ${x + 7 * s} ${y - 6 * s} L${x + 7 * s} ${y + 6 * s} Z`} fill="#5A6470" stroke="#9AA6B2" strokeWidth={sw} />
          <Path d={`M${x} ${y - 8 * s} l0 ${8 * s} M${x - 3 * s} ${y - 5 * s} l${6 * s} 0`} stroke={INK} strokeWidth={1.2} />
          <Line x1={x - 11 * s} y1={y + 6 * s} x2={x + 11 * s} y2={y + 6 * s} stroke={INK_SOFT} strokeWidth={1.2} />
        </G>
      );
    case 'deadtree':
      return (
        <Path
          key={k}
          d={`M${x} ${y + 8 * s} L${x} ${y - 8 * s} M${x} ${y - 2 * s} L${x - 7 * s} ${y - 10 * s} M${x} ${y - 5 * s} L${x + 6 * s} ${y - 13 * s} M${x - 4 * s} ${y - 6 * s} L${x - 8 * s} ${y - 6 * s}`}
          stroke="#9A7B5A"
          strokeWidth={sw + 0.4}
          strokeLinecap="round"
          fill="none"
        />
      );
    case 'dune':
      return (
        <G key={k}>
          <Path d={`M${x - 26 * s} ${y + 4 * s} Q${x - 6 * s} ${y - 10 * s} ${x + 26 * s} ${y + 4 * s}`} fill="#C99A52" stroke="#E8BE72" strokeWidth={sw} strokeLinecap="round" />
          <Path d={`M${x - 14 * s} ${y + 9 * s} Q${x + 2 * s} ${y + 1 * s} ${x + 18 * s} ${y + 9 * s}`} fill="none" stroke={INK_SOFT} strokeWidth={1.1} strokeLinecap="round" />
        </G>
      );
    case 'rock':
      return <Path key={k} d={`M${x - 8 * s} ${y + 4 * s} L${x - 5 * s} ${y - 4 * s} L${x + 2 * s} ${y - 6 * s} L${x + 8 * s} ${y + 4 * s} Z`} fill="#6E6258" stroke="#A8998A" strokeWidth={1.2} strokeLinejoin="round" />;
    case 'mesa':
      return (
        <G key={k}>
          <Path d={`M${x - 22 * s} ${y + 8 * s} L${x - 14 * s} ${y - 10 * s} L${x + 12 * s} ${y - 10 * s} L${x + 22 * s} ${y + 8 * s}`} fill="#A4532E" stroke="#D27A4E" strokeWidth={sw} strokeLinejoin="round" />
          <Line x1={x - 16 * s} y1={y - 2 * s} x2={x + 16 * s} y2={y - 2 * s} stroke={INK_SOFT} strokeWidth={1} />
        </G>
      );
    case 'volcano':
      return (
        <G key={k}>
          <Path d={`M${x - 28 * s} ${y + 10 * s} L${x - 7 * s} ${y - 18 * s} L${x + 7 * s} ${y - 18 * s} L${x + 28 * s} ${y + 10 * s}`} fill="#4A2A22" stroke="#7A4A3A" strokeWidth={sw} strokeLinejoin="round" />
          <Path d={`M${x - 3 * s} ${y - 18 * s} q${-2 * s} ${10 * s} ${-6 * s} ${16 * s} M${x + 3 * s} ${y - 18 * s} q${1 * s} ${8 * s} ${5 * s} ${12 * s}`} stroke="#FF7A3D" strokeWidth={2.2} fill="none" opacity={0.95} strokeLinecap="round" />
          <Circle cx={x - 2 * s} cy={y - 24 * s} r={2.5 * s} fill={INK_SOFT} />
          <Circle cx={x + 3 * s} cy={y - 30 * s} r={3.5 * s} fill={INK_SOFT} opacity={0.7} />
        </G>
      );
    case 'pyramid':
      return (
        <G key={k}>
          <Path d={`M${x - 22 * s} ${y + 8 * s} L${x} ${y - 18 * s} L${x + 22 * s} ${y + 8 * s} Z`} fill="#D9A55B" stroke="#F0C27E" strokeWidth={sw} strokeLinejoin="round" />
          <Line x1={x} y1={y - 18 * s} x2={x + 6 * s} y2={y + 8 * s} stroke={INK_SOFT} strokeWidth={1.1} />
        </G>
      );
  }
}

/** Scatter glyphs across the realm, keeping clear of the trail and every waypoint + label. */
function useScenery(seed: string, biome: Biome, width: number, height: number, pts: { x: number; y: number }[]) {
  return useMemo(() => {
    const rnd = seeded(seed);
    const kinds = BIOME[biome].kinds;
    // Points along the trail to keep clear of.
    const trail: { x: number; y: number }[] = [];
    const all = [{ x: width / 2, y: HEADER - 10 }, ...pts];
    for (let i = 1; i < all.length; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        const a = all[i - 1];
        const b = all[i];
        const my = (a.y + b.y) / 2;
        // Same cubic as the drawn trail: (a) → (a.x,my) → (b.x,my) → (b)
        const u = 1 - t;
        trail.push({
          x: u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * b.y,
        });
      }
    }
    const out: { kind: Kind; x: number; y: number; s: number }[] = [];
    const target = Math.round((height / 100) * 5.5);
    for (let tries = 0; tries < target * 14 && out.length < target; tries++) {
      const x = 18 + rnd() * (width - 36);
      const y = HEADER + 14 + rnd() * (height - HEADER - 28);
      const clearNode = pts.every((p) => Math.abs(p.x - x) > 84 || y < p.y - 74 || y > p.y + 88);
      const clearTrail = trail.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > 32 * 32);
      const clearOther = out.every((o) => (o.x - x) ** 2 + (o.y - y) ** 2 > 40 * 40);
      if (clearNode && clearTrail && clearOther) {
        out.push({ kind: kinds[Math.floor(rnd() * kinds.length)], x, y, s: 0.8 + rnd() * 0.45 });
      }
    }
    return out.sort((a, b) => a.y - b.y); // back-to-front
  }, [seed, biome, width, height, pts]);
}

function Waypoint({ node, i }: { node: MapNode; i: number }) {
  const current = node.status === 'current';
  const done = node.status === 'completed';
  const breath = useBreath(current, 2600);
  const halo = useAnimatedStyle(() => ({
    opacity: interpolate(breath.get(), [0, 1], [0.15, 0.4]),
    transform: [{ scale: interpolate(breath.get(), [0, 1], [1.05, 1.3]) }],
  }));
  const fill = done ? C.gold : current ? C.raised : '#1A1815cc';
  const iconColor = done ? onColor(C.gold) : current ? C.gold : C.faint;
  return (
    <Animated.View entering={rise(Math.min(i, 10) * 70, 12)} style={styles.nodeWrap}>
      <View style={styles.tagSlot}>
        {current ? (
          <View style={styles.hereTag}>
            <Icon name="map-marker" size={14} color={C.gold} />
            <T style={styles.hereText}>{S.youAreHere}</T>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {current ? <Animated.View pointerEvents="none" style={[styles.halo, { backgroundColor: C.gold }, halo]} /> : null}
        <View style={[styles.ring, { borderColor: done || current ? C.gold + '88' : INK_SOFT }]} />
        <PressableScale
          to={0.92}
          accessibilityRole="button"
          accessibilityLabel={node.title}
          onPress={node.onPress}
          style={[styles.node, { backgroundColor: fill, borderColor: current ? C.gold : done ? C.gold : '#2E2A25' }]}
        >
          <Icon name={node.status === 'locked' ? 'lock' : node.icon} size={32} color={iconColor} />
        </PressableScale>
        {done ? (
          <View style={styles.flag}>
            <Icon name="flag-variant" size={18} color={C.gold} />
          </View>
        ) : null}
      </View>
      {done ? <Stars n={node.stars} size={16} /> : null}
      <T style={[styles.label, node.status === 'locked' && { color: C.faint }]} numberOfLines={2}>
        {node.title}
      </T>
    </Animated.View>
  );
}

/** The chapter test: the realm's boss guards it, and you face it in a game of Snakes & Ladders. */
function BossLair({ node, chapterId, i }: { node: MapNode; chapterId: string; i: number }) {
  const boss = bossFor(chapterId);
  const beaten = node.status === 'completed';
  const breath = useBreath(!beaten, 2200);
  const glow = useAnimatedStyle(() => ({
    opacity: interpolate(breath.get(), [0, 1], [0.2, 0.5]),
    transform: [{ scale: interpolate(breath.get(), [0, 1], [1.02, 1.24]) }],
  }));
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(breath.get(), [0, 1], [2, -4]) }] }));
  const tilt = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(breath.get(), [0, 1], [-8, 8])}deg` }] }));
  const tagColor = beaten ? C.gold : node.early ? C.gold : boss.color;
  return (
    <Animated.View entering={rise(Math.min(i, 10) * 70 + 120, 14)} style={styles.nodeWrap}>
      <View style={styles.tagSlot}>
        <View style={[styles.bossTag, { borderColor: tagColor + '66' }]}>
          <Icon name={beaten ? 'crown' : node.early ? 'rocket-launch-outline' : 'sword-cross'} size={14} color={tagColor} />
          <T style={[styles.bossTagText, { color: tagColor }]}>{beaten ? S.bossDefeated : node.early ? `${S.skipTestTitle} · 90%` : S.bossFight}</T>
        </View>
      </View>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {!beaten ? <Animated.View pointerEvents="none" style={[styles.lairGlow, { backgroundColor: boss.color }, glow]} /> : null}
        <PressableScale
          to={0.93}
          accessibilityRole="button"
          accessibilityLabel={`${S.chapterTest}: ${boss.name}, ${S.snakesLadders}`}
          onPress={node.onPress}
          style={[styles.lair, { borderColor: beaten ? C.gold : boss.color, backgroundColor: '#1F1512' }]}
        >
          <Animated.View style={beaten ? undefined : float}>
            <Text style={[styles.bossEmoji, beaten && { opacity: 0.5 }]}>{boss.emoji}</Text>
          </Animated.View>
        </PressableScale>
        {/* The die says: this fight is a game of Snakes & Ladders */}
        <Animated.View pointerEvents="none" style={[styles.lairDie, !beaten && tilt]}>
          <Text style={{ fontSize: 26, lineHeight: 34 }}>🎲</Text>
        </Animated.View>
        {beaten ? (
          <View style={[styles.lairBadge, { backgroundColor: C.gold }]}>
            <Icon name="crown" size={16} color={C.onAccent} />
          </View>
        ) : null}
      </View>
      <T style={[styles.bossName, { color: C.text }]} numberOfLines={2}>
        {boss.name}
      </T>
      <T style={styles.bossSub}>{S.snakesLadders}</T>
    </Animated.View>
  );
}

export function RegionMap({
  chapterId,
  chapterTitle,
  locked,
  nodes,
  index,
  width,
}: {
  chapterId: string;
  chapterTitle: string;
  locked: boolean;
  nodes: MapNode[];
  index: number;
  width: number;
}) {
  const boss = bossFor(chapterId);
  const biome = BIOME[boss.biome];
  const cx = width / 2;
  const swing = Math.min(78, width * 0.2);
  const offsets = [0, swing, 0, -swing];
  const height = HEADER + nodes.length * ROW + 24;
  const pts = useMemo(
    () => nodes.map((n, i) => ({ x: cx + (n.isTest ? 0 : offsets[(index + i) % offsets.length]), y: HEADER + 40 + i * ROW })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length, cx, index, swing],
  );
  const scenery = useScenery(chapterId, boss.biome, width, height, pts);

  // Trail from the realm's entrance through every waypoint.
  const all = [{ x: cx, y: HEADER - 6 }, ...pts];
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const my = (a.y + b.y) / 2;
    return ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  };
  let full = `M ${all[0].x} ${all[0].y}`;
  for (let i = 1; i < all.length; i++) full += seg(all[i - 1], all[i]);
  // Walked part: up to the first node that is not completed.
  const reached = nodes.findIndex((n) => n.status !== 'completed');
  const walkedTo = reached === -1 ? nodes.length : locked ? 0 : reached;
  let walked = '';
  if (walkedTo > 0) {
    walked = `M ${all[0].x} ${all[0].y}`;
    for (let i = 1; i <= walkedTo; i++) walked += seg(all[i - 1], all[i]);
  }

  return (
    <Animated.View entering={rise(40)} style={[styles.realm, { width, height, backgroundColor: biome.tint, borderColor: boss.color + '55' }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {/* Old-map frame: outer hairline + inner dashed border */}
        <Rect x={6} y={6} width={width - 12} height={height - 12} rx={16} fill="none" stroke={boss.color} strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="3 5" />
        {boss.biome === 'coast' ? (
          <Path d={`M ${width} ${HEADER + 20} C ${width - 70} ${height * 0.35}, ${width - 30} ${height * 0.6}, ${width - 80} ${height} L ${width} ${height} Z`} fill="#13506A" opacity={0.9} />
        ) : null}
        {boss.biome === 'marsh' ? (
          <Path d={`M 0 ${height * 0.45} C ${width * 0.2} ${height * 0.42}, ${width * 0.15} ${height * 0.6}, 0 ${height * 0.66} Z`} fill="#1A5A52" opacity={0.85} />
        ) : null}
        {scenery.map((g, i) => (
          <Glyph key={i} k={i} kind={g.kind} x={g.x} y={g.y} s={g.s} />
        ))}
        <Path d={full} stroke="#D9C9A8" strokeOpacity={0.55} strokeWidth={4} strokeLinecap="round" strokeDasharray="0.5 11" fill="none" />
        {walked ? <Path d={walked} stroke={C.gold} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.85} /> : null}
      </Svg>

      {/* Realm header */}
      <View style={styles.header}>
        <View style={styles.headerRule}>
          <View style={styles.ruleLine} />
          <Text style={[styles.numeral, { color: boss.color }]}>{S.realm.toUpperCase()} {NUMERALS[index % NUMERALS.length]}</Text>
          <View style={styles.ruleLine} />
        </View>
        <T style={styles.realmName} numberOfLines={1}>
          {boss.realm}
        </T>
        <T style={styles.chapterName} numberOfLines={2}>
          {chapterTitle}
        </T>
      </View>
      {index === 0 ? (
        <View style={styles.compass} pointerEvents="none">
          <Icon name="compass-rose" size={40} color={INK_SOFT} />
        </View>
      ) : null}

      {nodes.map((n, i) =>
        n.isTest ? null : (
          <View key={n.key} style={{ position: 'absolute', left: 0, right: 0, top: pts[i].y - NODE / 2 - TAG }}>
            <View style={{ position: 'absolute', left: pts[i].x - 80, width: 160 }}>
              <Waypoint node={n} i={i} />
            </View>
          </View>
        ),
      )}

      {locked ? (
        <View pointerEvents="none" style={styles.fog}>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            {Array.from({ length: Math.ceil(height / 90) }).map((_, i) => (
              <G key={i} opacity={0.5}>
                <Ellipse cx={(i % 2 ? 0.3 : 0.7) * width} cy={HEADER + i * 90} rx={width * 0.45} ry={46} fill="#1E1C19" />
                <Ellipse cx={(i % 2 ? 0.75 : 0.2) * width} cy={HEADER + 40 + i * 90} rx={width * 0.35} ry={38} fill="#24211D" />
              </G>
            ))}
          </Svg>
          <View style={styles.fogLabel}>
            <Icon name="weather-fog" size={22} color={C.muted} />
            <T style={styles.fogText}>{S.unexplored}</T>
          </View>
        </View>
      ) : null}

      {/* The chapter test sits above the fog: it is always open, even in unexplored realms. */}
      {nodes.map((n, i) =>
        n.isTest ? (
          <View key={n.key} style={{ position: 'absolute', left: 0, right: 0, top: pts[i].y - LAIR / 2 - TAG }}>
            <View style={{ position: 'absolute', left: pts[i].x - 80, width: 160 }}>
              <BossLair node={n} chapterId={chapterId} i={i} />
            </View>
          </View>
        ) : null,
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  realm: { alignSelf: 'center', borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, marginTop: 14 },
  header: { position: 'absolute', top: 18, left: 20, right: 20, alignItems: 'center', gap: 2 },
  headerRule: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  ruleLine: { flex: 1, height: 1, backgroundColor: '#FFFFFF22' },
  numeral: { fontSize: 12, letterSpacing: 2.5, fontWeight: '600' },
  realmName: { fontFamily: SERIF, fontSize: 26, color: C.text, marginTop: 4 },
  chapterName: { fontSize: 15, color: C.muted, textAlign: 'center' },
  compass: { position: 'absolute', right: 14, top: 64, opacity: 0.9 },
  nodeWrap: { alignItems: 'center', width: 160 },
  tagSlot: { height: TAG, justifyContent: 'flex-start', alignItems: 'center' },
  ring: { position: 'absolute', width: NODE + 14, height: NODE + 14, borderRadius: (NODE + 14) / 2, borderWidth: 1, borderStyle: 'dashed' },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  halo: { position: 'absolute', width: NODE, height: NODE, borderRadius: NODE / 2 },
  flag: { position: 'absolute', top: -6, right: -2, backgroundColor: C.bg, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: C.gold + '66' },
  label: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 6, color: C.text, textShadowColor: '#000', textShadowRadius: 6 },
  hereTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: C.gold + '66' },
  hereText: { fontSize: 13, fontWeight: '700', color: C.goldDark },
  bossTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  bossTagText: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  lair: { width: LAIR, height: LAIR, borderRadius: LAIR / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  lairGlow: { position: 'absolute', width: LAIR, height: LAIR, borderRadius: LAIR / 2 },
  lairBadge: { position: 'absolute', bottom: 0, right: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  lairDie: { position: 'absolute', right: -4, bottom: -6 },
  bossEmoji: { fontSize: 54, lineHeight: 66, textAlign: 'center' },
  bossSub: { fontSize: 13, color: C.muted, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 6 },
  bossName: { fontFamily: SERIF, fontSize: 17, textAlign: 'center', marginTop: 8, textShadowColor: '#000', textShadowRadius: 6 },
  fog: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,13,12,0.45)' },
  fogLabel: { position: 'absolute', top: HEADER + 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(14,13,12,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  fogText: { fontSize: 15, color: C.muted, fontWeight: '600' },
});
