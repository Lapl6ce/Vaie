import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, shadow, WORDMARK_FONT, onColor, SERIF } from '../theme';
import { T } from '../i18n/T';
import { S } from '../i18n/strings';
import { ScreenHeader } from '../components/ScreenHeader';
import { Animated, PressableScale, rise, settle, STAGGER } from '../components/motion';
import { Button, ErrorBox, Icon, Loading, ProgressBar, SpeakButton } from '../components/ui';
import { BattleResult } from '../components/BattleResult';
import { api, friendlyError } from '../lib/api';
import { useApp } from '../lib/AppState';
import type { QuizResult } from '../lib/types';
import { useVoiceScreen, type Option } from '../voice/VoiceProvider';
import { speak, stopSpeaking } from '../voice/speaker';

type Q = { id: string; q: string; options: { text: string; key: number }[]; answerKey: number; explanation: string };
type QuizData = { kind: 'unit' | 'chapter'; refId: string; passPct: number; questions: Q[] };
const LETTERS: Option[] = ['A', 'B', 'C', 'D'];

export default function QuizScreen() {
  const { kind = 'unit', refId } = useLocalSearchParams<{ kind?: 'unit' | 'chapter'; refId: string }>();
  const { profile, refreshSummary } = useApp();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [battleDone, setBattleDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explain, setExplain] = useState<{ loading: boolean; text?: string; example?: string; error?: string } | null>(null);
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setQuiz(null);
    setIdx(0);
    setPicks({});
    setResult(null);
    setExplain(null);
    try {
      setQuiz(await api<QuizData>(`/api/quiz?kind=${kind}&refId=${refId}`));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [kind, refId]);

  useEffect(() => {
    load();
    return () => {
      stopSpeaking();
      if (autoNext.current) clearTimeout(autoNext.current);
    };
  }, [load]);

  const q = quiz?.questions[idx];
  const picked = q ? picks[q.id] : undefined;
  const total = quiz?.questions.length ?? 0;

  const submit = useCallback(
    async (allPicks: Record<string, number>) => {
      if (!quiz || !profile) return;
      setSubmitting(true);
          try {
        const r = await api<QuizResult>('/api/quiz/submit', {
          body: {
            profileId: profile.id,
            kind: quiz.kind,
            refId: quiz.refId,
            answers: quiz.questions.map((qq) => ({ qid: qq.id, key: allPicks[qq.id] })),
          },
        });
        setResult(r);
        // Rewards play out on the battle results screen; here we just set the tone.
        setBattleDone(false);
        Haptics.notificationAsync(r.passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
        if (r.passed) speak([S.victory, r.kind === 'chapter' ? S.passedChapter : S.passedUnit, ...(r.leveledUp ? [S.levelUp] : [])]);
        else speak(r.kind === 'chapter' ? S.needMoreChapter : S.needMore);
        refreshSummary();
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setSubmitting(false);
      }
    },
    [quiz, profile, refreshSummary],
  );

  const goNext = useCallback(() => {
    if (!quiz) return;
    if (autoNext.current) clearTimeout(autoNext.current);
    stopSpeaking();
    if (idx + 1 < quiz.questions.length) setIdx(idx + 1);
    else submit(picks);
  }, [quiz, idx, picks, submit]);

  const pick = useCallback(
    (optionIndex: number, byVoice = false) => {
      if (!q || picked !== undefined) return;
      const opt = q.options[optionIndex];
      if (!opt) return;
      const right = opt.key === q.answerKey;
      setPicks((p) => ({ ...p, [q.id]: opt.key }));
      Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
      if (byVoice) speak(right ? S.correct : S.notQuite);
    },
    [q, picked],
  );

  // Advance automatically after a voice answer, so hands-free users can continue.
  const voicePicked = useRef(false);
  useEffect(() => {
    if (picked !== undefined && voicePicked.current) {
      voicePicked.current = false;
      autoNext.current = setTimeout(goNext, 1800);
    }
  }, [picked, goNext]);

  useVoiceScreen({
    name: result ? 'quiz_result' : 'quiz',
    read: () => {
      if (result) {
        const wrong = result.results.filter((r) => !r.correct);
        return [
          `${S.youScored} ${result.correct} ${S.of} ${result.total}`,
          result.passed ? S.passedUnit : kind === 'chapter' ? S.needMoreChapter : S.needMore,
          ...wrong.flatMap((w) => [w.q, `${S.rightAnswer}: ${w.options[w.correctKey]}`, w.explanation]),
        ];
      }
      if (!q) return [];
      return [q.q, ...q.options.map((o, i) => `${LETTERS[i]}: ${o.text}`), S.sayAnswer];
    },
    onAnswer: result
      ? undefined
      : (o) => {
          voicePicked.current = true;
          pick(LETTERS.indexOf(o), true);
        },
  });

  const explainDifferently = async () => {
    if (!result) return;
    const wrong = result.results.filter((r) => !r.correct);
    // Question ids look like "<unitId>-q3": find the unit with the most mistakes.
    const counts = new Map<string, number>();
    wrong.forEach((w) => {
      const u = w.qid.replace(/-q\d+$/, '');
      counts.set(u, (counts.get(u) ?? 0) + 1);
    });
    const unitId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (kind === 'unit' ? refId : '');
    setExplain({ loading: true });
    try {
      const r = await api<{ explanation: string; example: string }>('/api/ai/explain', {
        body: { unitId, wrong: wrong.map((w) => w.q) },
        timeoutMs: 30_000,
      });
      setExplain({ loading: false, text: r.explanation, example: r.example });
      speak([r.explanation, r.example]);
    } catch (e) {
      setExplain({ loading: false, error: friendlyError(e) });
    }
  };

  const backToMap = () => {
    stopSpeaking();
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };

  const title = kind === 'chapter' ? S.chapterTest : S.checkUnderstanding;

  if (error) return <View style={{ flex: 1 }}><ScreenHeader title={title} back /><ErrorBox message={error} onRetry={result ? undefined : load} /></View>;
  if (!quiz || submitting) return <View style={{ flex: 1 }}><ScreenHeader title={title} back /><Loading /></View>;

  // ---------------------------------------------------------------- results
  if (result) {
    const wrong = result.results.filter((r) => !r.correct);
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title={title} back />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 140 }}>
          <BattleResult result={result} onDone={() => setBattleDone(true)} />

          {battleDone ? (
          <>
          {wrong.length ? <T style={styles.section}>{S.reviewMistakes}</T> : null}
          {wrong.map((w) => (
            <View key={w.qid} style={styles.review}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <T style={{ fontSize: 19, fontWeight: '800', flex: 1 }}>{w.q}</T>
                <SpeakButton text={[w.q, `${S.rightAnswer}: ${w.options[w.correctKey]}`, w.explanation]} size={44} />
              </View>
              <View style={[styles.ans, { backgroundColor: C.dangerLight }]}>
                <Icon name="close-circle" size={24} color={C.danger} />
                <T style={{ flex: 1 }}>{w.options[w.chosenKey] ?? '—'}</T>
              </View>
              <View style={[styles.ans, { backgroundColor: C.successLight }]}>
                <Icon name="check-circle" size={24} color={C.success} />
                <T style={{ flex: 1, fontWeight: '700' }}>{w.options[w.correctKey]}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Icon name="lightbulb-on-outline" size={22} color={C.goldDark} />
                <T style={{ flex: 1, color: C.muted }}>{w.explanation}</T>
              </View>
            </View>
          ))}

          {!result.passed ? (
            <>
              {explain?.text ? (
                <View style={styles.explain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="owl" size={32} color={C.blue} />
                    <T style={{ fontSize: 21, fontWeight: '900', color: C.blue, flex: 1 }}>{S.simplerExplanation}</T>
                    <SpeakButton text={[explain.text, explain.example ?? '']} color={C.blue} />
                  </View>
                  <T style={{ fontSize: 20, lineHeight: 30 }}>{explain.text}</T>
                  {explain.example ? (
                    <View style={styles.example}>
                      <Icon name="home-group" size={26} color={C.green} />
                      <T style={{ flex: 1, fontSize: 19, fontStyle: 'italic' }}>{explain.example}</T>
                    </View>
                  ) : null}
                </View>
              ) : explain?.error ? (
                <T style={{ color: C.danger, textAlign: 'center' }}>{explain.error}</T>
              ) : null}
              {!explain?.text ? (
                <Button label={S.explainDifferently} icon="owl" color={C.blue} big loading={explain?.loading} onPress={explainDifferently} />
              ) : null}
              <Button label={S.tryAgainNew} icon="refresh" color={C.gold} big onPress={load} />
              <Button label={S.backToMap} icon="map-marker-path" variant="outline" onPress={backToMap} />
            </>
          ) : (
            <Button label={S.continue} icon="arrow-right-bold-circle" big onPress={backToMap} />
          )}
          </>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  // ---------------------------------------------------------------- question
  if (!q) return <Loading />;
  const right = picked !== undefined && picked === q.answerKey;
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={title} back />
      <View style={{ paddingHorizontal: 16, gap: 6 }}>
        <ProgressBar value={(idx + (picked !== undefined ? 1 : 0)) / total} color={C.green} height={16} />
        <Text style={{ color: C.muted, fontSize: 16, fontWeight: '700', textAlign: 'right' }}>
          {idx + 1} / {total}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 160 }}>
        <Animated.View key={`q-${idx}`} entering={rise()} style={styles.qCard}>
          <T style={styles.qText}>{q.q}</T>
        </Animated.View>
        {q.options.map((o, i) => {
          const isPicked = picked === o.key;
          const isRight = picked !== undefined && o.key === q.answerKey;
          const bg = isRight ? C.successLight : isPicked ? C.dangerLight : C.card;
          const border = isRight ? C.success : isPicked ? C.danger : C.border;
          return (
            <PressableScale
              key={`${idx}-${o.key}`}
              entering={rise(80 + i * STAGGER)}
              accessibilityRole="button"
              onPress={() => pick(i)}
              disabled={picked !== undefined}
              to={0.98}
              style={[styles.opt, { backgroundColor: bg, borderColor: border }]}
            >
              <View style={[styles.letter, { backgroundColor: isRight ? C.success : isPicked ? C.danger : C.raised }]}>
                <Text style={[styles.letterText, (isRight || isPicked) && { color: isRight ? onColor(C.success) : C.white }]}>{LETTERS[i]}</Text>
              </View>
              <T style={styles.optText}>{o.text}</T>
              {isRight ? <Icon name="check-circle" size={30} color={C.success} /> : isPicked ? <Icon name="close-circle" size={30} color={C.danger} /> : null}
            </PressableScale>
          );
        })}
        {picked === undefined ? (
          <View style={styles.hint}>
            <Icon name="microphone" size={22} color={C.muted} />
            <T style={{ color: C.muted, flex: 1 }}>{S.sayAnswer}</T>
          </View>
        ) : (
          <Animated.View entering={settle()} style={[styles.feedback, { backgroundColor: right ? C.successLight : C.terracottaLight }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={right ? 'emoticon-excited' : 'emoticon-confused'} size={36} color={right ? C.success : C.terracotta} />
              <T style={{ fontSize: 24, fontWeight: '800', color: right ? C.success : C.terracotta }}>{right ? S.correct : S.notQuite}</T>
            </View>
            <Button label={idx + 1 < total ? S.next : S.done} icon="arrow-right-bold" color={right ? C.success : C.terracotta} big onPress={goNext} />
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  qCard: { backgroundColor: C.card, borderRadius: 22, padding: 20, ...shadow },
  qText: { fontSize: 24, fontFamily: SERIF, lineHeight: 34, color: C.text },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, borderRadius: 20, borderWidth: 3, padding: 12 },
  letter: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontSize: 22, fontWeight: '900', color: C.goldDark },
  optText: { flex: 1, fontSize: 20, fontWeight: '600', color: C.text },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 8 },
  feedback: { borderRadius: 22, padding: 16, gap: 12 },
  scoreCard: { ...shadow, alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 28, padding: 24, borderWidth: 3 },
  scoreCircle: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontFamily: WORDMARK_FONT, fontSize: 48, color: C.white, lineHeight: 60 },
  scoreMsg: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  xpCard: { backgroundColor: C.goldLight, borderRadius: 22, padding: 16, gap: 8, borderWidth: 2, borderColor: C.gold },
  xpBig: { fontFamily: WORDMARK_FONT, fontSize: 32, color: C.goldDark, lineHeight: 42 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: C.terracottaLight, padding: 10, borderRadius: 16 },
  unlocked: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.greenLight, padding: 16, borderRadius: 20 },
  section: { fontSize: 22, fontFamily: SERIF, marginTop: 4 },
  review: { backgroundColor: C.card, borderRadius: 20, padding: 14, gap: 10, ...shadow },
  ans: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14 },
  explain: { backgroundColor: C.blueLight, borderRadius: 22, padding: 16, gap: 10, borderWidth: 2, borderColor: C.blue },
  example: { flexDirection: 'row', gap: 8, backgroundColor: C.card, padding: 12, borderRadius: 16 },
});
