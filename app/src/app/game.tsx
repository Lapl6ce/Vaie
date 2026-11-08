/**
 * Chapter test as Snakes & Ladders.
 *
 *  Roll the die → the number sets the question's difficulty (1–2 easy, 3–4 medium, 5–6 hard)
 *  → answer right: move ahead by the roll (ladders up, snakes down); wrong: turn skipped.
 *  First to square 100 ends the game. Solo, or Versus against the realm's boss (played by the app).
 *
 * Every player's moves (turns taken), correct answers and square are recorded on the server.
 * The test is graded on the human's answers: 70% normally, 90% when taken before the module is
 * finished (a "skip test" that completes the whole module).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, SERIF, onColor } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { Text } from '../components/Text';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button, ErrorBox, Icon, Loading, SpeakButton } from '../components/ui';
import { Animated, PressableScale, fadeOut, rise, settle, STAGGER } from '../components/motion';
import { BattleResult } from '../components/BattleResult';
import { HOP_MS, JUMP_MS, JUMPS, LADDERS, RollingDie, SnakesBoard, type TokenMove } from '../components/SnakesBoard';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import { bossFor } from '../lib/bosses';
import type { QuizResult } from '../lib/types';
import { useVoiceScreen, type Option } from '../voice/VoiceProvider';
import { speak, stopSpeaking } from '../voice/speaker';

type GQ = { id: string; q: string; options: { text: string; key: number }[]; answerKey: number; explanation: string; difficulty: number };
type GameData = { chapterId: string; early: boolean; passPct: number; questions: GQ[] };
type Mode = 'solo' | 'versus';
type Player = { id: string; name: string; avatar: string; color: string; isAi: boolean; pos: number; moves: number; correct: number; asked: number; move?: TokenMove };
type Phase = 'setup' | 'roll' | 'rolling' | 'question' | 'feedback' | 'ai' | 'moving' | 'over';

const LETTERS: Option[] = ['A', 'B', 'C', 'D'];
const DIFF = {
  1: { label: S.easy, color: C.success },
  2: { label: S.medium, color: C.gold },
  3: { label: S.hard, color: C.danger },
} as const;
const difficultyFor = (roll: number) => (roll <= 2 ? 1 : roll <= 4 ? 2 : 3) as 1 | 2 | 3;
/** The boss's chance of answering right, by difficulty. */
const BOT_SKILL = { 1: 0.85, 2: 0.68, 3: 0.5 };
const BOARD = Math.min(Dimensions.get('window').width - 24, 440);

export default function GameScreen() {
  const { chapterId = '' } = useLocalSearchParams<{ chapterId: string }>();
  const { profile, refreshSummary } = useApp();
  const realm = bossFor(chapterId);

  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('solo');
  const [phase, setPhase] = useState<Phase>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [turn, setTurn] = useState(0);
  const [roll, setRoll] = useState(1);
  const [question, setQuestion] = useState<GQ | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [botRight, setBotRight] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; icon: 'ladder' | 'snake' | 'skip-next' ; color: string } | null>(null);
  const [answers, setAnswers] = useState<{ qid: string; key: number }[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [saved, setSaved] = useState<{ bestMoves: number | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      stopSpeaking();
    },
    [],
  );

  // Question queues per difficulty: no repeats until a level runs out.
  const queues = useRef<Record<number, GQ[]>>({ 1: [], 2: [], 3: [] });
  const nextQuestion = useCallback(
    (d: 1 | 2 | 3) => {
      if (!data) return null;
      const order = d === 1 ? [1, 2, 3] : d === 2 ? [2, 1, 3] : [3, 2, 1];
      for (const level of order) {
        if (!queues.current[level].length) {
          queues.current[level] = data.questions.filter((q) => q.difficulty === level).sort(() => Math.random() - 0.5);
        }
        const q = queues.current[level].shift();
        if (q) return q;
      }
      return null;
    },
    [data],
  );

  const load = useCallback(async () => {
    if (!profile || !chapterId) return;
    setError(null);
    try {
      setData(await api<GameData>(`/api/game?profileId=${profile.id}&chapterId=${chapterId}`));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [profile, chapterId]);
  useEffect(() => {
    load();
  }, [load]);

  const start = (m: Mode) => {
    if (!profile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    timers.current.forEach(clearTimeout);
    timers.current = [];
    queues.current = { 1: [], 2: [], 3: [] };
    const me: Player = { id: 'me', name: profile.name, avatar: profile.avatar || '🙂', color: C.gold, isAi: false, pos: 0, moves: 0, correct: 0, asked: 0 };
    const bot: Player = { id: 'bot', name: realm.name, avatar: realm.emoji, color: realm.color, isAi: true, pos: 0, moves: 0, correct: 0, asked: 0 };
    setMode(m);
    setPlayers(m === 'versus' ? [me, bot] : [me]);
    setTurn(0);
    setAnswers([]);
    setResult(null);
    setSaved(null);
    setQuestion(null);
    setPicked(null);
    setToast(null);
    setGameKey((k) => k + 1);
    setPhase('roll');
  };

  const current = players[turn];

  // ------------------------------------------------------------------ turn flow
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const update = (id: string, fn: (p: Player) => Player) => setPlayers((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));

  const finish = useCallback(
    async (finalPlayers: Player[], winnerId: string | null) => {
      setPhase('over');
      const me = finalPlayers.find((p) => !p.isAi)!;
      const ranked = [...finalPlayers].sort((a, b) => (a.id === winnerId ? -1 : b.id === winnerId ? 1 : b.pos - a.pos));
      if (!profile) return;
      setSubmitting(true);
      try {
        const [quiz, rec] = await Promise.all([
          me.asked > 0
            ? api<QuizResult>('/api/quiz/submit', { body: { profileId: profile.id, kind: 'chapter', refId: chapterId, answers: answersRef.current } })
            : Promise.resolve(null),
          api<{ bestMoves: number | null }>('/api/game/result', {
            body: {
              profileId: profile.id,
              chapterId,
              mode,
              winner: winnerId ? finalPlayers.find((p) => p.id === winnerId)?.name : null,
              players: ranked.map((p, i) => ({ name: p.name, avatar: p.avatar, isAi: p.isAi, moves: p.moves, correct: p.correct, asked: p.asked, position: p.pos, rank: i + 1 })),
            },
          }),
        ]);
        setResult(quiz);
        setSaved(rec);
        refreshSummary();
        if (quiz?.passed) speak([quiz.skipped ? S.moduleSkipped : S.passedChapter]);
        else speak(S.needMoreChapter);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setSubmitting(false);
      }
    },
    [profile, chapterId, mode, refreshSummary],
  );

  const nextTurn = useCallback(() => {
    const count = playersRef.current.length;
    setTurn((t) => (count > 1 ? (t + 1) % count : 0));
    setQuestion(null);
    setPicked(null);
    setBotRight(null);
    setPhase('roll');
  }, []);

  /** Move the current player `steps` squares (if `advance`), resolve snakes/ladders, then continue. */
  const resolve = useCallback(
    (advance: boolean, steps: number) => {
      const p = playersRef.current[turn];
      if (!p) return;
      if (!advance) {
        setToast({ id: Date.now(), text: S.turnSkipped, icon: 'skip-next', color: C.muted });
        later(nextTurn, 1100);
        return;
      }
      const target = Math.min(100, p.pos + steps);
      const path: number[] = [];
      for (let s = p.pos + 1; s <= target; s++) path.push(s);
      const jump = JUMPS[target];
      if (jump) path.push(jump);
      const dest = jump ?? target;
      setPhase('moving');
      update(p.id, (q) => ({ ...q, move: { id: Date.now(), path } }));
      const walk = (path.length - (jump ? 1 : 0)) * HOP_MS;
      if (jump) {
        later(() => {
          const up = !!LADDERS[target];
          Haptics.notificationAsync(up ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
          setToast({ id: Date.now(), text: up ? S.ladderUp : S.snakeDown, icon: up ? 'ladder' : 'snake', color: up ? C.success : C.danger });
        }, walk);
      }
      later(() => {
        const finalPlayers = playersRef.current.map((q) => (q.id === p.id ? { ...q, pos: dest } : q));
        setPlayers(finalPlayers);
        if (dest >= 100) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          finish(finalPlayers, p.id);
        } else nextTurn();
      }, walk + (jump ? JUMP_MS : 0) + 250);
    },
    [turn, nextTurn, finish],
  );

  const doRoll = useCallback(() => {
    const p = playersRef.current[turn];
    if (!p || phase !== 'roll') return;
    const value = 1 + Math.floor(Math.random() * 6);
    setRoll(value);
    setPhase('rolling');
    update(p.id, (q) => ({ ...q, moves: q.moves + 1 }));
    later(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      const d = difficultyFor(value);
      if (p.isAi) {
        setPhase('ai');
        later(() => {
          const ok = Math.random() < BOT_SKILL[d];
          setBotRight(ok);
          update(p.id, (q) => ({ ...q, asked: q.asked + 1, correct: q.correct + (ok ? 1 : 0) }));
          setPhase('feedback');
          later(() => resolve(ok, value), 1100);
        }, 1300);
      } else {
        setQuestion(nextQuestion(d));
        setPicked(null);
        setPhase('question');
      }
    }, 760);
  }, [turn, phase, nextQuestion, resolve]);

  // The boss rolls on its own.
  useEffect(() => {
    if (phase === 'roll' && current?.isAi) later(doRoll, 900);
    // Only on entering the bot's roll phase; doRoll's identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current?.isAi, turn]);

  const answer = (optionIndex: number) => {
    if (!question || picked !== null || phase !== 'question') return;
    const opt = question.options[optionIndex];
    if (!opt) return;
    const ok = opt.key === question.answerKey;
    setPicked(opt.key);
    setAnswers((a) => [...a, { qid: question.id, key: opt.key }]);
    update('me', (q) => ({ ...q, asked: q.asked + 1, correct: q.correct + (ok ? 1 : 0) }));
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setPhase('feedback');
  };

  useVoiceScreen({
    name: 'game',
    read: () =>
      phase === 'question' && question
        ? [question.q, ...question.options.map((o, i) => `${LETTERS[i]}: ${o.text}`), S.sayAnswer]
        : phase === 'roll' && !current?.isAi
          ? [S.yourTurn, S.rollDie]
          : [S.snakesLadders],
    onAnswer: (o) => answer(LETTERS.indexOf(o)),
    onStartQuiz: phase === 'roll' && !current?.isAi ? doRoll : undefined,
  });

  // Auto-hide toasts.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(t);
  }, [toast]);

  const me = players.find((p) => !p.isAi);
  const myScore = me && me.asked ? Math.round((me.correct / me.asked) * 100) : 0;
  const boardPlayers = useMemo(() => players.map((p) => ({ id: p.id, avatar: p.avatar, color: p.color, pos: p.pos, move: p.move })), [players]);

  // ------------------------------------------------------------------ render
  const title = S.snakesLadders;
  if (error) return <View style={{ flex: 1 }}><ScreenHeader title={title} back /><ErrorBox message={error} onRetry={load} /></View>;
  if (!data) return <View style={{ flex: 1 }}><ScreenHeader title={title} back /><Loading /></View>;

  if (phase === 'setup') {
    const pct = Math.round(data.passPct * 100);
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title={title} back />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 140 }}>
          <Animated.View entering={rise()} style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 72, lineHeight: 88 }}>{realm.emoji}</Text>
            <T style={[styles.realm, { color: realm.color }]}>{realm.name}</T>
            <T style={{ color: C.muted, fontSize: 15 }}>{`${S.guardian}: ${realm.realm}`}</T>
            <T style={styles.taunt}>{`“${realm.taunt}”`}</T>
            <Text style={{ fontSize: 26, lineHeight: 34, marginTop: 4 }}>🎲 🐍 🪜</Text>
          </Animated.View>

          {data.early ? (
            <Animated.View entering={rise(60)} style={styles.skip}>
              <Icon name="rocket-launch-outline" size={26} color={C.gold} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700', color: C.goldDark }}>{S.skipTestTitle}</T>
                <T style={{ fontSize: 15, color: C.text }}>{S.skipTestDesc}</T>
              </View>
            </Animated.View>
          ) : null}

          <T style={styles.h}>{S.chooseMode}</T>
          {(
            [
              { m: 'solo' as Mode, icon: '🧭', label: S.solo, desc: S.soloDesc },
              { m: 'versus' as Mode, icon: realm.emoji, label: `${S.versus} · ${realm.name}`, desc: S.versusDesc },
            ]
          ).map((o, i) => (
            <PressableScale key={o.m} entering={rise(120 + i * STAGGER)} to={0.97} onPress={() => start(o.m)} style={styles.modeCard}>
              <Text style={{ fontSize: 40, lineHeight: 50 }}>{o.icon}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontSize: 22, fontFamily: SERIF }}>{o.label}</T>
                <T style={{ fontSize: 15, color: C.muted }}>{o.desc}</T>
              </View>
              <Icon name="chevron-right" size={26} color={C.muted} />
            </PressableScale>
          ))}

          <Animated.View entering={rise(260)} style={styles.rules}>
            <T style={styles.rulesTitle}>{S.howToPlay}</T>
            {[S.rule1, S.rule2, S.rule3].map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={styles.ruleNum}>{i + 1}</Text>
                <T style={{ flex: 1, fontSize: 16 }}>{r}</T>
              </View>
            ))}
            <View style={styles.diffRow}>
              {([1, 2, 3] as const).map((d) => (
                <View key={d} style={[styles.diffChip, { backgroundColor: DIFF[d].color + '22', borderColor: DIFF[d].color + '66' }]}>
                  <Text style={{ color: DIFF[d].color, fontWeight: '700' }}>{d === 1 ? '⚀ ⚁' : d === 2 ? '⚂ ⚃' : '⚄ ⚅'}</Text>
                  <T style={{ color: DIFF[d].color, fontWeight: '700', fontSize: 15 }}>{DIFF[d].label}</T>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T style={{ flex: 1, fontSize: 15, color: C.muted }}>{S.passRule}</T>
              <Text style={styles.pct}>{pct}%</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  if (phase === 'over') {
    const winner = players.find((p) => p.pos >= 100);
    const ranked = [...players].sort((a, b) => (a === winner ? -1 : b === winner ? 1 : b.pos - a.pos));
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title={title} back />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 160 }}>
          <Animated.View entering={settle()} style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 64, lineHeight: 78 }}>{winner?.avatar ?? '🎲'}</Text>
            <T style={[styles.realm, { color: winner && !winner.isAi ? C.gold : C.text }]}>{winner && !winner.isAi ? S.youWin : `${winner?.name ?? realm.name} ${S.botWins}`}</T>
          </Animated.View>

          <Animated.View entering={rise(150)} style={styles.table}>
            <View style={[styles.tr, { borderTopWidth: 0 }]}>
              <View style={{ flex: 1 }} />
              <T style={styles.th}>{S.movesLabel}</T>
              <T style={styles.th}>{S.correctLabel}</T>
              <T style={styles.th}>{S.squareLabel}</T>
            </View>
            {ranked.map((p, i) => (
              <Animated.View key={p.id} entering={rise(250 + i * 120, 6)} style={styles.tr}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={{ fontSize: 24 }}>{p.avatar}</Text>
                  <T style={{ fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                    {p.isAi ? p.name : S.you}
                  </T>
                </View>
                <Text style={styles.td}>{p.moves}</Text>
                <Text style={styles.td}>
                  {p.correct}/{p.asked}
                </Text>
                <Text style={[styles.td, p.pos >= 100 && { color: C.gold }]}>{p.pos}</Text>
              </Animated.View>
            ))}
            {saved?.bestMoves ? (
              <View style={[styles.tr, { justifyContent: 'space-between' }]}>
                <T style={{ color: C.muted }}>{S.bestMoves}</T>
                <Text style={{ fontWeight: '700', color: C.goldDark }}>
                  {saved.bestMoves} {S.movesLabel.toLowerCase()}
                </Text>
              </View>
            ) : null}
          </Animated.View>

          {submitting ? <Loading /> : null}
          {result ? (
            <>
              {result.skipped ? (
                <Animated.View entering={settle()} style={styles.skip}>
                  <Icon name="rocket-launch" size={26} color={C.gold} />
                  <T style={{ flex: 1, fontWeight: '700', color: C.goldDark }}>{S.moduleSkipped}</T>
                </Animated.View>
              ) : null}
              <BattleResult result={result} />
            </>
          ) : null}

          <Button label={S.playAgain} icon="dice-multiple" big onPress={() => start(mode)} />
          <Button label={S.backToMap} icon="map-marker-path" variant="outline" onPress={() => router.back()} />
        </ScrollView>
      </View>
    );
  }

  // ---- playing
  const myTurn = !!current && !current.isAi;
  const showSheet = (phase === 'question' || (phase === 'feedback' && myTurn)) && question;
  const d = difficultyFor(roll);
  const right = picked !== null && question ? picked === question.answerKey : false;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={realm.realm} back />
      <ScrollView contentContainerStyle={{ paddingBottom: 220, alignItems: 'center', gap: 12 }}>
        {/* Players */}
        <View style={styles.hud}>
          {players.map((p, i) => (
            <View key={p.id} style={[styles.hudCard, i === turn && { borderColor: p.color, backgroundColor: p.color + '14' }]}>
              <Text style={{ fontSize: 26 }}>{p.avatar}</Text>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                  {p.isAi ? p.name : S.you}
                </T>
                <Text style={{ fontSize: 13, color: C.muted }}>
                  ▣ {p.pos} · {p.moves} {S.movesLabel.toLowerCase()} · ✓ {p.correct}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <SnakesBoard key={gameKey} size={BOARD} players={boardPlayers} activeId={current?.id} />

        {/* Die + status */}
        <View style={styles.dieRow}>
          <RollingDie value={roll} rolling={phase === 'rolling'} size={68} />
          <View style={{ flex: 1, gap: 4 }}>
            {phase === 'roll' ? (
              <T style={styles.status}>{myTurn ? S.yourTurn : `${current?.name} ${S.botTurn}`}</T>
            ) : phase === 'ai' ? (
              <T style={styles.status}>{`${current?.name} ${S.botThinking}`}</T>
            ) : phase === 'feedback' && !myTurn ? (
              <T style={[styles.status, { color: botRight ? C.success : C.danger }]}>{`${current?.name} ${botRight ? S.botRight : S.botWrong}`}</T>
            ) : (
              <View style={[styles.diffChip, { alignSelf: 'flex-start', backgroundColor: DIFF[d].color + '22', borderColor: DIFF[d].color + '66' }]}>
                <T style={{ color: DIFF[d].color, fontWeight: '700', fontSize: 15 }}>{DIFF[d].label}</T>
              </View>
            )}
            {me ? (
              <Text style={{ color: C.muted, fontSize: 13 }}>
                {me.correct}/{me.asked} · {myScore}% / {Math.round(data.passPct * 100)}%
              </Text>
            ) : null}
          </View>
          {phase === 'roll' && myTurn ? <Button label={S.rollDie} icon="dice-5" onPress={doRoll} /> : null}
        </View>
      </ScrollView>

      {toast ? (
        <Animated.View key={toast.id} entering={settle()} exiting={fadeOut} pointerEvents="none" style={styles.toast}>
          <Icon name={toast.icon} size={22} color={toast.color} />
          <T style={{ fontWeight: '700', color: toast.color }}>{toast.text}</T>
        </Animated.View>
      ) : null}

      {showSheet && question ? (
        <Animated.View key={question.id} entering={rise(0, 40)} style={styles.sheet}>
          <ScrollView contentContainerStyle={{ gap: 10, padding: 16, paddingBottom: 110 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.diffChip, { backgroundColor: DIFF[d].color + '22', borderColor: DIFF[d].color + '66' }]}>
                <Text style={{ color: DIFF[d].color, fontWeight: '700' }}>🎲 {roll}</Text>
                <T style={{ color: DIFF[d].color, fontWeight: '700', fontSize: 15 }}>{DIFF[d].label}</T>
              </View>
              <View style={{ flex: 1 }} />
              <SpeakButton text={[question.q, ...question.options.map((o, i) => `${LETTERS[i]}: ${o.text}`)]} size={44} />
            </View>
            <T style={styles.q}>{question.q}</T>
            {question.options.map((o, i) => {
              const isPicked = picked === o.key;
              const isRight = picked !== null && o.key === question.answerKey;
              return (
                <PressableScale
                  key={o.key}
                  entering={rise(60 + i * STAGGER, 6)}
                  to={0.98}
                  disabled={picked !== null}
                  onPress={() => answer(i)}
                  style={[
                    styles.opt,
                    isRight && { borderColor: C.success, backgroundColor: C.successLight },
                    isPicked && !isRight && { borderColor: C.danger, backgroundColor: C.dangerLight },
                  ]}
                >
                  <View style={[styles.letter, isRight && { backgroundColor: C.success }, isPicked && !isRight && { backgroundColor: C.danger }]}>
                    <Text style={[styles.letterText, (isRight || isPicked) && { color: isRight ? onColor(C.success) : C.white }]}>{LETTERS[i]}</Text>
                  </View>
                  <T style={{ flex: 1, fontSize: 18 }}>{o.text}</T>
                </PressableScale>
              );
            })}
            {picked !== null ? (
              <Animated.View entering={settle()} style={{ gap: 10 }}>
                {!right ? <T style={{ color: C.muted, fontSize: 15 }}>{question.explanation}</T> : null}
                <Button
                  label={right ? `${S.moveAhead} ${roll}` : S.turnSkipped}
                  icon={right ? 'shoe-print' : 'skip-next'}
                  color={right ? C.success : C.terracotta}
                  big
                  onPress={() => {
                    setQuestion(null);
                    resolve(right, roll);
                  }}
                />
              </Animated.View>
            ) : null}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  realm: { fontFamily: SERIF, fontSize: 28, textAlign: 'center', color: C.text },
  taunt: { fontFamily: SERIF, fontSize: 18, color: C.muted, textAlign: 'center', fontStyle: 'italic', marginTop: 4 },
  h: { fontFamily: SERIF, fontSize: 22, marginTop: 4 },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.goldLight, borderWidth: 1, borderColor: C.gold + '55' },
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  rules: { gap: 12, padding: 16, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  rulesTitle: { fontSize: 13, letterSpacing: 1.5, color: C.muted, fontWeight: '700', textTransform: 'uppercase' },
  ruleNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.raised, textAlign: 'center', lineHeight: 24, fontWeight: '700', color: C.gold, fontSize: 14 },
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  diffChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  pct: { fontFamily: SERIF, fontSize: 26, color: C.gold },
  hud: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, alignSelf: 'stretch', marginTop: 4 },
  hudCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  dieRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, alignSelf: 'stretch' },
  status: { fontFamily: SERIF, fontSize: 20 },
  toast: { position: 'absolute', top: '42%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(14,13,12,0.92)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: C.border },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '68%', backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.border },
  q: { fontFamily: SERIF, fontSize: 22, lineHeight: 31, color: C.text },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, padding: 10, backgroundColor: C.bg },
  letter: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised },
  letterText: { fontSize: 18, fontWeight: '800', color: C.goldDark },
  table: { backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.border },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  th: { width: 64, textAlign: 'center', fontSize: 12, color: C.muted, fontWeight: '700', textTransform: 'uppercase' },
  td: { width: 64, textAlign: 'center', fontSize: 18, fontWeight: '700', color: C.text },
  rank: { width: 22, fontFamily: SERIF, fontSize: 18, color: C.gold },
});
