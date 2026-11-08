/**
 * Read-aloud: text -> server /api/tts (Sarvam Bulbul, cached on the server) -> play the clips in order.
 * Never throws: returns false if audio is unavailable so callers can stay text-only.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { absoluteUrl, api } from '../lib/api';
import { engine } from '../i18n/engine';
import { hasVoice } from '../i18n/languages';

type Listener = (speaking: boolean) => void;

let current: AudioPlayer | null = null;
let token = 0;
const listeners = new Set<Listener>();
let speaking = false;

function setSpeaking(v: boolean) {
  speaking = v;
  listeners.forEach((l) => l(v));
}

export const isSpeaking = () => speaking;
export function onSpeakingChange(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function initAudio() {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  token++;
  try {
    current?.pause();
    current?.remove();
  } catch {
    /* ignore */
  }
  current = null;
  setSpeaking(false);
}

function playOne(url: string, myToken: number): Promise<void> {
  return new Promise((resolve) => {
    if (myToken !== token) return resolve();
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      sub?.remove();
      try {
        player.remove();
      } catch {
        /* ignore */
      }
      if (current === player) current = null;
      resolve();
    };
    const player = createAudioPlayer({ uri: absoluteUrl(url) });
    current = player;
    // Safety net: never wait more than 3 minutes for one clip.
    const guard = setTimeout(done, 180_000);
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (myToken !== token) return done();
      if (s.didJustFinish) done();
    });
    player.play();
  });
}

/** Speak already-translated text in `lang`. */
export async function speakRaw(text: string, lang: string): Promise<boolean> {
  stopSpeaking();
  if (!text?.trim() || !hasVoice(lang)) return false;
  const myToken = ++token;
  setSpeaking(true);
  try {
    const { urls } = await api<{ urls: string[] }>('/api/tts', { body: { text, lang }, timeoutMs: 30_000 });
    for (const u of urls) {
      if (myToken !== token) break;
      await playOne(u, myToken);
    }
    return urls.length > 0;
  } catch {
    return false;
  } finally {
    if (myToken === token) setSpeaking(false);
  }
}

/** Translate English text(s) into the app language, then speak. */
export async function speak(english: string | string[]): Promise<boolean> {
  const parts = (Array.isArray(english) ? english : [english]).filter(Boolean);
  if (!parts.length) return false;
  const translated = await engine.translateNow(parts);
  return speakRaw(translated.join('. ').replace(/\.\s*\./g, '.'), engine.lang);
}
