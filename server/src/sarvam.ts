/**
 * Sarvam AI wrappers. Verified against docs.sarvam.ai on 2026-11-07:
 *  - Auth header: `api-subscription-key`
 *  - POST /translate       JSON {input, source_language_code, target_language_code, model, mode}
 *                          mayura:v1 supports all 11 Vaie languages + source "auto"; max 1000 chars/input.
 *  - POST /text-to-speech  JSON {text, language_code, model, speaker, ...} -> {audios: [base64]}
 *                          bulbul:v3 supports all 11 languages (v4-flash lacks Malayalam + Odia); max 2500 chars.
 *  - POST /speech-to-text  multipart {file, model, language_code} -> {transcript, language_code}
 *                          Accepts WAV/MP3/AAC/OGG/FLAC/MP4/M4A/AMR/WebM; max 30 s per sync request.
 *                          Android's recorder (expo-audio HIGH_QUALITY) produces .m4a (AAC), which is accepted
 *                          directly. If Sarvam ever rejects a file we convert it with ffmpeg (if installed) to
 *                          16 kHz mono WAV and retry.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { config } from './config.ts';
import { db } from './db.ts';
import { HttpError, fetchWithTimeout, semaphore, sha } from './util.ts';

const BASE = 'https://api.sarvam.ai';

/** App language code -> Sarvam BCP-47 code. All 11 are supported for translate, TTS (bulbul:v3) and STT. */
export const LANGS: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  or: 'od-IN', // Odia: ISO code "or", Sarvam uses "od-IN"
};
export const VOICE_LANGS = new Set(Object.keys(LANGS)); // all 11 have TTS + STT today

export function sarvamCode(lang: string): string {
  const c = LANGS[lang];
  if (!c) throw new HttpError(400, `Unsupported language: ${lang}`, 'bad_language');
  return c;
}

function requireKey() {
  if (!config.sarvamKey) throw new HttpError(503, 'SARVAM_API_KEY is missing in server/.env', 'no_key');
}

async function sarvamJson(pathname: string, body: unknown) {
  requireKey();
  const res = await fetchWithTimeout(BASE + pathname, {
    method: 'POST',
    headers: { 'api-subscription-key': config.sarvamKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn(`[sarvam] ${pathname} ${res.status}: ${text.slice(0, 300)}`);
    throw new HttpError(res.status === 429 ? 429 : 502, `Sarvam ${pathname} failed (${res.status})`, 'sarvam_error');
  }
  return JSON.parse(text);
}

// ---------------------------------------------------------------- translate

const translateSlots = semaphore(6);

/** Split long text into <= max-char chunks on sentence/line boundaries. */
function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[.!?।\n])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).length > max && cur) {
      out.push(cur);
      cur = p;
    } else cur = cur ? cur + ' ' + p : p;
  }
  if (cur) out.push(cur);
  // hard-split anything still too long
  return out.flatMap((c) => (c.length <= max ? [c] : c.match(new RegExp(`[\\s\\S]{1,${max}}`, 'g'))!));
}

async function translateOne(input: string, source: string, target: string): Promise<{ text: string; detected?: string }> {
  const call = (mode: string) =>
    sarvamJson('/translate', {
      input,
      source_language_code: source === 'auto' ? 'auto' : sarvamCode(source),
      target_language_code: sarvamCode(target),
      model: 'mayura:v1',
      mode,
      numerals_format: 'international',
    });
  let r;
  try {
    r = await translateSlots(() => call('modern-colloquial'));
  } catch (e) {
    if (e instanceof HttpError && e.code === 'no_key') throw e;
    r = await translateSlots(() => call('formal'));
  }
  return { text: r.translated_text as string, detected: r.source_language_code };
}

const getCached = db.prepare('SELECT out FROM translations WHERE hash = ?');
const putCached = db.prepare('INSERT OR REPLACE INTO translations (hash, lang, src, out, created_at) VALUES (?,?,?,?,?)');

/**
 * Translate a batch of strings. Cached in SQLite by hash(source + target + text).
 * Returns null for any string that failed, so the app can fall back to the original.
 */
export async function translateBatch(texts: string[], target: string, source = 'en'): Promise<(string | null)[]> {
  sarvamCode(target);
  const inflight = new Map<string, Promise<string | null>>(); // dedupe identical strings in one batch
  return Promise.all(
    texts.map((raw) => {
      const key = String(raw ?? '');
      if (!inflight.has(key)) inflight.set(key, translateOneCached(key, target, source));
      return inflight.get(key)!;
    }),
  );
}

async function translateOneCached(raw: string, target: string, source: string): Promise<string | null> {
  const text = String(raw ?? '');
  if (!text.trim() || (source === target && source !== 'auto')) return text;
  if (!/\p{L}/u.test(text)) return text; // numbers / symbols only
  const hash = sha(`${source}|${target}|${text}`);
  const hit = getCached.get(hash) as { out: string } | undefined;
  if (hit) return hit.out;
  try {
    const chunks = chunkText(text, 900);
    const outs = await Promise.all(chunks.map((c) => translateOne(c, source, target)));
    const out = outs.map((o) => o.text).join(' ');
    putCached.run(hash, target, text, out, Date.now());
    return out;
  } catch (e) {
    if (e instanceof HttpError && e.code === 'no_key') throw e;
    console.warn('[translate] failed:', (e as Error).message);
    return null;
  }
}

/** Free-form translation for the Translate tool (auto-detects the source language). */
export async function translateFree(text: string, target: string) {
  const chunks = chunkText(text, 900);
  const outs = await Promise.all(chunks.map((c) => translateOne(c, 'auto', target)));
  return { text: outs.map((o) => o.text).join(' '), detected: outs[0]?.detected };
}

// ---------------------------------------------------------------- TTS

export const ttsDir = path.join(config.cacheDir, 'tts');
fs.mkdirSync(ttsDir, { recursive: true });
const ttsSlots = semaphore(3);
const SPEAKER = 'priya'; // bulbul:v3 voice; falls back to the model default if rejected

async function synth(text: string, lang: string): Promise<string> {
  const hash = sha(`v3|${lang}|${text}`);
  for (const ext of ['mp3', 'wav']) {
    if (fs.existsSync(path.join(ttsDir, `${hash}.${ext}`))) return `${hash}.${ext}`;
  }
  const body: Record<string, unknown> = {
    text,
    language_code: sarvamCode(lang),
    model: 'bulbul:v3',
    speaker: SPEAKER,
    pace: 0.95,
    output_audio_codec: 'mp3',
  };
  let r;
  try {
    r = await ttsSlots(() => sarvamJson('/text-to-speech', body));
  } catch (e) {
    if (e instanceof HttpError && (e.code === 'no_key' || e.status === 429)) throw e;
    // Retry with the most conservative settings: default speaker + WAV.
    delete body.speaker;
    delete body.output_audio_codec;
    r = await ttsSlots(() => sarvamJson('/text-to-speech', body));
  }
  const buf = Buffer.from((r.audios as string[]).join(''), 'base64');
  const isWav = buf.subarray(0, 4).toString('ascii') === 'RIFF';
  const file = `${hash}.${isWav ? 'wav' : 'mp3'}`;
  fs.writeFileSync(path.join(ttsDir, file), buf);
  return file;
}

/** Returns a list of audio file names (played one after another by the app). */
export async function tts(text: string, lang: string): Promise<string[]> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 6000);
  if (!clean) return [];
  const chunks = chunkText(clean, 1400);
  return Promise.all(chunks.map((c) => synth(c, lang)));
}

// ---------------------------------------------------------------- STT

const sttSlots = semaphore(3);

async function sttCall(buf: Buffer, filename: string, mime: string, lang: string | null, model: string) {
  requireKey();
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), filename);
  form.append('model', model);
  form.append('language_code', lang ? sarvamCode(lang) : 'unknown');
  const res = await fetchWithTimeout(BASE + '/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': config.sarvamKey },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn(`[sarvam] /speech-to-text ${res.status}: ${text.slice(0, 300)}`);
    throw new HttpError(res.status === 429 ? 429 : 502, `Speech recognition failed (${res.status})`, 'sarvam_error');
  }
  return JSON.parse(text) as { transcript: string; language_code?: string };
}

function ffmpegToWav(input: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const tmpIn = path.join(os.tmpdir(), `vaie-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tmpOut = tmpIn + '.wav';
    fs.writeFileSync(tmpIn, input);
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmpIn, '-ac', '1', '-ar', '16000', tmpOut]);
    const done = (ok: boolean) => {
      const out = ok && fs.existsSync(tmpOut) ? fs.readFileSync(tmpOut) : null;
      fs.rmSync(tmpIn, { force: true });
      fs.rmSync(tmpOut, { force: true });
      resolve(out);
    };
    p.on('error', () => done(false)); // ffmpeg not installed
    p.on('close', (code) => done(code === 0));
  });
}

export async function stt(buf: Buffer, mime: string, filename: string, lang: string | null) {
  return sttSlots(async () => {
    try {
      return await sttCall(buf, filename, mime || 'audio/mp4', lang, 'saaras:v4');
    } catch (e) {
      if (e instanceof HttpError && (e.code === 'no_key' || e.status === 429)) throw e;
      console.warn('[stt] direct upload failed, trying ffmpeg -> wav with saaras:v3');
      const wav = await ffmpegToWav(buf);
      if (wav) return sttCall(wav, 'audio.wav', 'audio/wav', lang, 'saaras:v3');
      return sttCall(buf, filename, mime || 'audio/mp4', lang, 'saaras:v3');
    }
  });
}
