/**
 * Minimal Gemini REST client with structured (JSON-schema) output.
 * The API key stays on the server; the phone never sees it.
 */
import { config } from './config.ts';
import { HttpError, fetchWithTimeout, semaphore } from './util.ts';

const slots = semaphore(4);
const FALLBACK_MODEL = 'gemini-flash-latest';
/** Used when the main model is too slow. Lite models answer in about a second. */
const FAST_MODEL = 'gemini-flash-lite-latest';

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export async function geminiJSON<T>(opts: {
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  if (!config.geminiKey) throw new HttpError(503, 'GEMINI_API_KEY is missing in server/.env', 'no_key');
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseSchema: opts.schema,
    temperature: opts.temperature ?? 0.4,
  };
  // Flash models answer faster with thinking off; other models keep their default.
  if (/2\.5-flash/.test(config.geminiModel)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const call = (model: string, gen: Record<string, unknown>, ms: number) =>
    slots(() =>
      fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: 'user', parts: opts.parts }],
            generationConfig: gen,
          }),
        },
        ms,
      ),
    );
  const total = opts.timeoutMs ?? config.upstreamTimeoutMs;
  // Give the configured model most of the time budget, but keep some back so a stalled model
  // (Google's "-latest" aliases sometimes point at a very slow new model) can fall back to Lite.
  const primaryMs = Math.round(total * 0.6);
  const { thinkingConfig: _drop, ...plainGen } = generationConfig;
  let res: Response;
  try {
    res = await call(config.geminiModel, generationConfig, primaryMs);
    // Google retires model names regularly. If the configured one is gone, use the rolling alias.
    if (res.status === 404 && config.geminiModel !== FALLBACK_MODEL) {
      console.warn(`[gemini] model "${config.geminiModel}" not found, retrying with ${FALLBACK_MODEL}. Update GEMINI_MODEL in server/.env.`);
      res = await call(FALLBACK_MODEL, plainGen, total - primaryMs);
    }
  } catch (e) {
    if (!(e instanceof HttpError) || e.code !== 'timeout') throw e;
    console.warn(`[gemini] "${config.geminiModel}" took over ${primaryMs} ms, retrying with ${FAST_MODEL}`);
    res = await call(FAST_MODEL, plainGen, total - primaryMs);
  }
  const body = await res.text();
  if (!res.ok) {
    console.warn(`[gemini] ${res.status}: ${body.slice(0, 400)}`);
    throw new HttpError(res.status === 429 ? 429 : 502, `Gemini failed (${res.status})`, 'gemini_error');
  }
  const json = JSON.parse(body);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) throw new HttpError(502, 'Gemini returned no answer', 'gemini_empty');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, 'Gemini returned malformed JSON', 'gemini_bad_json');
  }
}
