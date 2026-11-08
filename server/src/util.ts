import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.ts';

export const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}

/** fetch with a hard timeout so a stuck upstream can never hang a request. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = config.upstreamTimeoutMs) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new HttpError(504, 'The AI service took too long to answer', 'timeout');
    }
    throw new HttpError(502, 'Could not reach the AI service (is the laptop online?)', 'upstream_unreachable');
  }
}

/** Tiny semaphore: limits how many upstream calls run at once. */
export function semaphore(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/** Simple fixed-window rate limiter per client IP. */
export function rateLimit(perMinute: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'x';
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) {
      h = { n: 0, reset: now + 60_000 };
      hits.set(key, h);
    }
    if (++h.n > perMinute) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment.', code: 'rate_limited' });
      return;
    }
    next();
  };
}

export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
