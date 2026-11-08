/**
 * Snakes & Ladders board (10×10, boustrophedon numbering from the bottom-left), animated
 * player tokens that hop square by square, and a rolling die.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { Text } from './Text';
import { Animated, EASE } from './motion';

/** Ladder bottoms → tops. */
export const LADDERS: Record<number, number> = { 4: 25, 13: 46, 21: 42, 33: 49, 50: 69, 62: 81, 74: 92 };
/** Snake heads → tails. */
export const SNAKES: Record<number, number> = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };
export const JUMPS: Record<number, number> = { ...LADDERS, ...SNAKES };

export const HOP_MS = 210;
export const JUMP_MS = 850;

const CELL_COLORS = ['#2B5A3C', '#6B5420', '#25546A', '#6A302B', '#4A5A26'];
const SNAKE_COLORS = ['#7BC96F', '#F2555A', '#E8C95F', '#5FB8D8', '#F29E4C', '#8CC084', '#E58A6B', '#7FBFB2'];

/** Centre of square n (1–100). Square 0 is the start spot just below square 1. */
export function cellCenter(n: number, cs: number) {
  if (n <= 0) return { x: cs * 0.5, y: cs * 10 + cs * 0.55 };
  const idx = Math.min(100, n) - 1;
  const row = Math.floor(idx / 10);
  const col = row % 2 === 0 ? idx % 10 : 9 - (idx % 10);
  return { x: col * cs + cs / 2, y: (9 - row) * cs + cs / 2 };
}

function Ladder({ from, to, cs }: { from: number; to: number; cs: number }) {
  const a = cellCenter(from, cs);
  const b = cellCenter(to, cs);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * cs * 0.17;
  const ny = (dx / len) * cs * 0.17;
  const rungs = Math.max(2, Math.floor(len / (cs * 0.42)));
  return (
    <G>
      <Line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} stroke="#3A2A14" strokeWidth={5} strokeLinecap="round" />
      <Line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny} stroke="#3A2A14" strokeWidth={5} strokeLinecap="round" />
      {Array.from({ length: rungs }).map((_, i) => {
        const t = (i + 0.5) / rungs;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        return <Line key={i} x1={x + nx} y1={y + ny} x2={x - nx} y2={y - ny} stroke="#E0B470" strokeWidth={2.6} strokeLinecap="round" />;
      })}
      <Line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} stroke="#C8924E" strokeWidth={3} strokeLinecap="round" />
      <Line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny} stroke="#C8924E" strokeWidth={3} strokeLinecap="round" />
    </G>
  );
}

function Snake({ head, tail, cs, color }: { head: number; tail: number; cs: number; color: string }) {
  const h = cellCenter(head, cs);
  const t = cellCenter(tail, cs);
  const dx = t.x - h.x;
  const dy = t.y - h.y;
  const len = Math.hypot(dx, dy);
  const px = (-dy / len) * Math.min(cs * 1.1, len * 0.35);
  const py = (dx / len) * Math.min(cs * 1.1, len * 0.35);
  // S-curve: two control points pushed to opposite sides.
  const d = `M ${h.x} ${h.y} C ${h.x + dx * 0.3 + px} ${h.y + dy * 0.3 + py}, ${h.x + dx * 0.7 - px} ${h.y + dy * 0.7 - py}, ${t.x} ${t.y}`;
  const w = cs * 0.3;
  const ang = Math.atan2(dy, dx);
  const ex = Math.cos(ang + Math.PI / 2) * w * 0.28;
  const ey = Math.sin(ang + Math.PI / 2) * w * 0.28;
  const fx = Math.cos(ang) * w * 0.15;
  const fy = Math.sin(ang) * w * 0.15;
  return (
    <G>
      <Path d={d} stroke="#0B0A09" strokeWidth={w + 3} strokeLinecap="round" fill="none" opacity={0.6} />
      <Path d={d} stroke={color} strokeWidth={w} strokeLinecap="round" fill="none" />
      <Path d={d} stroke="#0B0A09" strokeWidth={w * 0.3} strokeLinecap="round" strokeDasharray={`${w * 0.5} ${w * 0.9}`} fill="none" opacity={0.35} />
      <Circle cx={h.x} cy={h.y} r={w * 0.78} fill={color} stroke="#0B0A09" strokeWidth={1.5} />
      <Circle cx={h.x + ex + fx} cy={h.y + ey + fy} r={w * 0.17} fill="#FFFFFF" />
      <Circle cx={h.x - ex + fx} cy={h.y - ey + fy} r={w * 0.17} fill="#FFFFFF" />
      <Circle cx={h.x + ex + fx * 1.4} cy={h.y + ey + fy * 1.4} r={w * 0.08} fill="#0B0A09" />
      <Circle cx={h.x - ex + fx * 1.4} cy={h.y - ey + fy * 1.4} r={w * 0.08} fill="#0B0A09" />
    </G>
  );
}

export type TokenMove = { id: number; path: number[] };

function Token({
  cs,
  pos,
  move,
  color,
  avatar,
  offset,
  active,
}: {
  cs: number;
  pos: number;
  move?: TokenMove;
  color: string;
  avatar: string;
  offset: number;
  active: boolean;
}) {
  const start = cellCenter(pos, cs);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const hop = useSharedValue(0);
  const lastMove = useRef(0);

  useEffect(() => {
    if (!move || move.id === lastMove.current) return;
    lastMove.current = move.id;
    const cells = move.path;
    if (!cells.length) return;
    // Walk square by square; the final entry may be a ladder/snake jump.
    const steps = cells.map((c, i) => {
      const p = cellCenter(c, cs);
      const isJump = i === cells.length - 1 && cells.length > 1 && Math.abs(c - cells[i - 1]) > 1;
      return { ...p, ms: isJump ? JUMP_MS : HOP_MS, isJump };
    });
    x.set(withSequence(...steps.map((s) => withTiming(s.x, { duration: s.ms, easing: s.isJump ? Easing.inOut(Easing.cubic) : EASE }))) as number);
    y.set(withSequence(...steps.map((s) => withTiming(s.y, { duration: s.ms, easing: s.isJump ? Easing.inOut(Easing.cubic) : EASE }))) as number);
    hop.set(
      withSequence(
        ...steps.flatMap((s) =>
          s.isJump
            ? [withTiming(0, { duration: s.ms })]
            : [withTiming(1, { duration: s.ms / 2, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: s.ms / 2, easing: Easing.in(Easing.quad) })],
        ),
      ) as number,
    );
    const ticks = steps.filter((s) => !s.isJump).length;
    for (let i = 0; i < ticks; i++) setTimeout(() => Haptics.selectionAsync().catch(() => {}), i * HOP_MS + HOP_MS * 0.9);
  }, [move, cs, x, y, hop]);

  const size = cs * 0.62;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() - size / 2 + offset },
      { translateY: y.get() - size / 2 - interpolate(hop.get(), [0, 1], [0, cs * 0.35]) },
      { scale: interpolate(hop.get(), [0, 1], [1, 1.12]) },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.token,
        { width: size, height: size, borderRadius: size / 2, borderColor: color, borderWidth: active ? 3 : 2, zIndex: active ? 3 : 2 },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.55, lineHeight: size * 0.75, textAlign: 'center' }}>{avatar}</Text>
    </Animated.View>
  );
}

export type BoardPlayer = { id: string; avatar: string; color: string; pos: number; move?: TokenMove };

export function SnakesBoard({ size, players, activeId }: { size: number; players: BoardPlayer[]; activeId?: string }) {
  const cs = size / 10;
  const cells = useMemo(
    () =>
      Array.from({ length: 100 }, (_, i) => {
        const n = i + 1;
        const c = cellCenter(n, cs);
        const row = Math.floor(i / 10);
        const col = Math.round((c.x - cs / 2) / cs);
        const base = CELL_COLORS[(row + col) % CELL_COLORS.length];
        return { n, x: c.x - cs / 2, y: c.y - cs / 2, fill: base, light: (row + col) % 2 === 0 };
      }),
    [cs],
  );

  // Players sharing a square sit side by side.
  const offsets = players.map((p, i) => {
    const same = players.filter((q) => q.pos === p.pos);
    if (same.length < 2) return 0;
    const k = same.findIndex((q) => q.id === p.id);
    return (k - (same.length - 1) / 2) * cs * 0.32 + 0 * i;
  });

  return (
    <View style={{ width: size, height: size + cs * 1.1 }}>
      <View style={[styles.boardFrame, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          {cells.map((c) => (
            <G key={c.n}>
              <Rect x={c.x} y={c.y} width={cs} height={cs} fill={c.fill} opacity={c.light ? 1 : 0.78} />
              <SvgText x={c.x + 3} y={c.y + cs * 0.28} fontSize={cs * 0.24} fill="#F7F3EA" opacity={0.75} fontWeight="bold">
                {c.n}
              </SvgText>
            </G>
          ))}
          {/* Finish square */}
          <Rect x={cellCenter(100, cs).x - cs / 2} y={cellCenter(100, cs).y - cs / 2} width={cs} height={cs} fill={C.gold} opacity={0.9} />
          <SvgText x={cellCenter(100, cs).x} y={cellCenter(100, cs).y + cs * 0.12} fontSize={cs * 0.34} fill={C.onAccent} fontWeight="bold" textAnchor="middle">
            100
          </SvgText>
          {Object.entries(LADDERS).map(([a, b]) => (
            <Ladder key={`l${a}`} from={Number(a)} to={b} cs={cs} />
          ))}
          {Object.entries(SNAKES).map(([a, b], i) => (
            <Snake key={`s${a}`} head={Number(a)} tail={b} cs={cs} color={SNAKE_COLORS[i % SNAKE_COLORS.length]} />
          ))}
        </Svg>
      </View>
      <View style={[styles.start, { top: size + cs * 0.1, height: cs * 0.9, width: cs * 2.2 }]}>
        <Text style={styles.startText}>START</Text>
      </View>
      {players.map((p, i) => (
        <Token key={p.id} cs={cs} pos={p.pos} move={p.move} color={p.color} avatar={p.avatar} offset={offsets[i]} active={p.id === activeId} />
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ die

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

export function DieFace({ value, size = 72 }: { value: number; size?: number }) {
  const pip = size * 0.16;
  const pad = size * 0.18;
  const step = (size - pad * 2 - pip) / 2;
  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.2 }]}>
      {(PIPS[value] ?? PIPS[1]).map(([c, r], i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: pad + c * step, top: pad + r * step, width: pip, height: pip, borderRadius: pip / 2, backgroundColor: C.onAccent }}
        />
      ))}
    </View>
  );
}

/** Die that tumbles while `rolling` and lands on `value`. */
export function RollingDie({ value, rolling, size = 72 }: { value: number; rolling: boolean; size?: number }) {
  const [face, setFace] = useState(value);
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!rolling) return;
    spin.set(0);
    spin.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    const t = setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 6));
      Haptics.selectionAsync().catch(() => {});
    }, 80);
    return () => clearInterval(t);
  }, [rolling, spin]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(spin.get(), [0, 1], [0, 720])}deg` },
      { scale: interpolate(spin.get(), [0, 0.5, 1], [1, 1.18, 1]) },
      { translateY: interpolate(spin.get(), [0, 0.4, 1], [0, -16, 0]) },
    ],
  }));
  return (
    <Animated.View style={style}>
      <DieFace value={rolling ? face : value} size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  boardFrame: { borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: '#3A342C' },
  token: { position: 'absolute', left: 0, top: 0, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  start: { position: 'absolute', left: 0, borderRadius: 10, borderWidth: 1, borderColor: '#3A342C', borderStyle: 'dashed', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 },
  startText: { fontSize: 11, letterSpacing: 1.5, color: C.faint, fontWeight: '700' },
  die: { backgroundColor: C.text, borderWidth: 1, borderColor: '#D9D2C2' },
});
