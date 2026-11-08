/**
 * Voice everywhere.
 *  - One shared recorder (the floating mic and the big mics all use it).
 *  - Each screen registers what "read aloud" means for it, plus optional handlers
 *    (quiz answers, start quiz, ask a question).
 *  - Spoken commands: STT (Sarvam) -> intent (Gemini structured output, keyword fallback)
 *    -> navigate / act -> spoken confirmation in the user's language.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { api } from '../lib/api';
import { useApp } from '../lib/AppState';
import { S } from '../i18n/strings';
import { onSpeakingChange, speak, speakRaw, stopSpeaking } from './speaker';

export type Option = 'A' | 'B' | 'C' | 'D';
export type ScreenVoice = {
  name: string;
  /** English texts to read aloud for this screen (header speaker + "read aloud" command). */
  read?: () => string[];
  /** Already-translated text to speak as-is (e.g. a Translate result). Checked before `read`. */
  readRaw?: () => { text: string; lang: string } | null;
  onAnswer?: (o: Option) => void;
  onStartQuiz?: () => void;
  onAsk?: (text: string) => void;
};

type VoiceState = 'idle' | 'listening' | 'processing';
type Ctx = {
  state: VoiceState;
  speaking: boolean;
  heard: string | null;
  message: string | null;
  toggle: () => void;
  /** Record once and return the transcript (no command routing). lang null = auto-detect. */
  listenRaw: (lang?: string | null) => Promise<string | null>;
  readScreen: () => void;
  stopAll: () => void;
  register: (cfg: React.RefObject<ScreenVoice>) => () => void;
};

const VoiceCtx = createContext<Ctx>(null as unknown as Ctx);
export const useVoice = () => useContext(VoiceCtx);

const REC_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
};
const MAX_RECORD_MS = 12_000;

/** Register the current screen's voice behaviour while it is focused. */
export function useVoiceScreen(cfg: ScreenVoice) {
  const { register } = useVoice();
  const ref = useRef(cfg);
  ref.current = cfg;
  useFocusEffect(useCallback(() => register(ref), [register]));
}

const DEVANAGARI_OPTIONS: Record<string, Option> = { 'ए': 'A', 'बी': 'B', 'सी': 'C', 'डी': 'D' };
function quickOption(t: string): Option | null {
  const s = t.trim().toLowerCase().replace(/[.!?,।]/g, '').replace(/^option\s+/, '');
  if (/^[abcd]$/.test(s)) return s.toUpperCase() as Option;
  return DEVANAGARI_OPTIONS[s] ?? null;
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { lang, profile, setLang, adultLearn } = useApp();
  const recorder = useAudioRecorder(REC_OPTIONS);
  const [state, setState] = useState<VoiceState>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const screens = useRef<React.RefObject<ScreenVoice>[]>([]);
  const rawResolver = useRef<{ resolve: (t: string | null) => void; lang: string | null } | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => onSpeakingChange(setSpeaking), []);

  const screen = () => screens.current[screens.current.length - 1]?.current ?? null;

  const register = useCallback((ref: React.RefObject<ScreenVoice>) => {
    screens.current.push(ref);
    return () => {
      screens.current = screens.current.filter((r) => r !== ref);
    };
  }, []);

  const flash = useCallback((english: string, say = true) => {
    setMessage(english);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => {
      setMessage(null);
      setHeard(null);
    }, 4500);
    if (say) speak(english);
  }, []);

  const readScreen = useCallback(() => {
    const raw = screen()?.readRaw?.();
    if (raw) {
      speakRaw(raw.text, raw.lang).then((ok) => {
        if (!ok) flash(S.audioUnavailable, false);
      });
      return;
    }
    const texts = screen()?.read?.() ?? [];
    if (!texts.length) return;
    speak(texts).then((ok) => {
      if (!ok) flash(S.audioUnavailable, false);
    });
  }, [flash]);

  // ------------------------------------------------------------ intent routing
  const mode = profile?.mode ?? 'student';
  const paths = {
    learn: mode === 'student' ? '/student/learn' : adultLearn ? '/adult/learn' : null,
    leaderboard: mode === 'student' ? '/student/leaderboard' : null,
    stats: mode === 'student' ? '/student/stats' : null,
    ask: mode === 'student' ? '/student/ask' : '/adult/ask',
    translate: mode === 'student' ? '/translate' : '/adult/translate',
    home: mode === 'student' ? '/student/learn' : '/adult/ask',
  };

  const handleUtterance = useCallback(
    async (text: string) => {
      const scr = screen();
      // 1. Fast path: quiz answers like "B" need no AI round-trip.
      const opt = scr?.onAnswer ? quickOption(text) : null;
      if (opt) {
        scr!.onAnswer!(opt);
        return;
      }
      setState('processing');
      let units: { id: string; title: string }[] = [];
      if (profile?.class) {
        units = await api<{ id: string; title: string }[]>(`/api/units?class=${profile.class}`).catch(() => []);
      }
      let intent: any;
      try {
        intent = await api('/api/ai/intent', {
          body: { text, lang, screen: scr?.name ?? 'unknown', mode, units },
          timeoutMs: 15_000,
        });
      } catch {
        intent = { intent: 'ask_assistant', text, confirmation: '' };
      } finally {
        setState('idle');
      }
      const go = (p: string | null, params?: Record<string, string>) => {
        if (!p) {
          flash(S.notAvailableHere);
          return false;
        }
        router.navigate(params ? ({ pathname: p, params } as any) : (p as any));
        return true;
      };
      const confirm = intent.confirmation || S.done;
      switch (intent.intent) {
        case 'answer_option':
          if (scr?.onAnswer && intent.option) scr.onAnswer(intent.option);
          else flash(S.notAvailableHere);
          return;
        case 'read_aloud':
          readScreen();
          return;
        case 'start_quiz':
          if (scr?.onStartQuiz) {
            flash(confirm);
            scr.onStartQuiz();
          } else flash(S.openLessonFirst);
          return;
        case 'open_subject':
          if (go(paths.learn, { subject: intent.subject ?? 'Science', t: String(Date.now()) })) flash(confirm);
          return;
        case 'open_lesson':
          if (intent.unit_id && units.some((u) => u.id === intent.unit_id)) {
            router.push(`/unit/${intent.unit_id}`);
            flash(confirm);
          } else flash(S.notAvailableHere);
          return;
        case 'show_leaderboard':
          if (go(paths.leaderboard)) flash(confirm);
          return;
        case 'show_stats':
          if (go(paths.stats)) flash(confirm);
          return;
        case 'show_streak':
          router.push('/streak');
          flash(confirm);
          return;
        case 'change_language':
          if (intent.language_code) {
            await setLang(intent.language_code);
            flash(confirm);
          }
          return;
        case 'open_translate':
          if (go(paths.translate)) flash(confirm);
          return;
        case 'go_home':
          if (go(paths.home)) flash(confirm);
          return;
        case 'open_settings':
          router.push('/settings');
          flash(confirm);
          return;
        case 'ask_assistant': {
          const q = intent.text || text;
          if (scr?.onAsk) scr.onAsk(q);
          else go(paths.ask, { q, t: String(Date.now()) });
          return;
        }
        default:
          flash(S.didNotHear);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, mode, profile?.class, adultLearn, flash, readScreen, setLang],
  );

  // ------------------------------------------------------------ recording
  const stopAndProcess = useCallback(async () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (stateRef.current !== 'listening') return;
    setState('processing');
    const raw = rawResolver.current;
    rawResolver.current = null;
    let transcript: string | null = null;
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error('no recording');
      const form = new FormData();
      form.append('file', { uri, name: 'voice.m4a', type: 'audio/mp4' } as any);
      const sttLang = raw ? raw.lang : lang;
      if (sttLang) form.append('lang', sttLang);
      const r = await api<{ transcript: string }>('/api/stt', { form, timeoutMs: 30_000 });
      transcript = r.transcript?.trim() || null;
    } catch {
      transcript = null;
    }
    setState('idle');
    if (!transcript) {
      raw?.resolve(null);
      flash(S.didNotHear);
      return;
    }
    setHeard(transcript);
    if (raw) {
      raw.resolve(transcript);
      return;
    }
    await handleUtterance(transcript);
  }, [recorder, lang, flash, handleUtterance]);

  const startListening = useCallback(async () => {
    stopSpeaking();
    setHeard(null);
    setMessage(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        flash(S.micPermission);
        rawResolver.current?.resolve(null);
        rawResolver.current = null;
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setState('listening');
      stopTimer.current = setTimeout(() => stopAndProcess(), MAX_RECORD_MS);
    } catch {
      setState('idle');
      rawResolver.current?.resolve(null);
      rawResolver.current = null;
      flash(S.didNotHear);
    }
  }, [recorder, flash, stopAndProcess]);

  const toggle = useCallback(() => {
    if (stateRef.current === 'listening') stopAndProcess();
    else if (stateRef.current === 'idle') startListening();
  }, [startListening, stopAndProcess]);

  const listenRaw = useCallback(
    (l: string | null = null) =>
      new Promise<string | null>((resolve) => {
        if (stateRef.current !== 'idle') return resolve(null);
        rawResolver.current = { resolve, lang: l };
        startListening();
      }),
    [startListening],
  );

  const stopAll = useCallback(() => {
    stopSpeaking();
    if (stateRef.current === 'listening') stopAndProcess();
  }, [stopAndProcess]);

  return (
    <VoiceCtx.Provider value={{ state, speaking, heard, message, toggle, listenRaw, readScreen, stopAll, register }}>
      {children}
    </VoiceCtx.Provider>
  );
}
