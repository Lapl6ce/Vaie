/**
 * Talks to the Vaie "town hall" server on the laptop. All AI calls go through it,
 * so no API keys live on the phone.
 */
export const DEFAULT_SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://192.168.1.10:4000').replace(/\/+$/, '');

let base = DEFAULT_SERVER_URL;
export const getServerUrl = () => base;
export const setServerUrl = (url: string) => {
  base = normalizeUrl(url);
};

export function normalizeUrl(url: string) {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//.test(u)) u = 'http://' + u;
  return u;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

/** English, friendly messages (they go through the translation layer when shown). */
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'offline') return "Can't reach the Vaie server. Check the Wi-Fi and try again.";
    if (e.code === 'timeout') return 'This is taking too long. Please try again.';
    if (e.code === 'rate_limited') return 'Too many requests. Please wait a moment.';
    if (e.code === 'no_key') return 'The server is missing its AI keys. Ask the teacher to add them.';
    if (e.status >= 500) return 'The helper is busy right now. Please try again.';
    return e.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

type Opts = { method?: string; body?: unknown; timeoutMs?: number; form?: FormData; serverUrl?: string };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  let res: Response;
  try {
    res = await fetch((opts.serverUrl ?? base) + path, {
      method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
      headers: opts.form ? undefined : opts.body ? { 'content-type': 'application/json' } : undefined,
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new ApiError('timeout', 0, 'timeout');
    throw new ApiError('offline', 0, 'offline');
  }
  clearTimeout(timer);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ApiError(json?.error ?? `HTTP ${res.status}`, res.status, json?.code ?? 'http');
  return json as T;
}

export const absoluteUrl = (p: string) => (p.startsWith('http') ? p : base + p);

export async function checkHealth(url = base) {
  return api<{ ok: boolean; gemini: boolean; sarvam: boolean; units: number }>('/api/health', {
    serverUrl: normalizeUrl(url),
    timeoutMs: 5000,
  });
}
