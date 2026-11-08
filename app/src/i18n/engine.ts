/**
 * Live translation engine.
 * - Every visible English string goes through `request()`.
 * - Missing strings are queued, batched (one POST per ~40 ms) and sent to the server,
 *   which translates with Sarvam and caches in SQLite.
 * - Results are cached in memory and persisted to AsyncStorage per language, so repeat
 *   views (even after restarting the app) are instant.
 * - Failures fall back to the original text and are retried after 30 s.
 */
import { api } from '../lib/api';
import { KEYS, getItem, setItem } from '../lib/storage';

type Listener = () => void;

class TranslationEngine {
  lang = 'en';
  private cache = new Map<string, Map<string, string>>();
  private pending = new Set<string>();
  private failedAt = new Map<string, number>();
  private queue = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private loaded = new Set<string>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  private map(lang = this.lang) {
    let m = this.cache.get(lang);
    if (!m) this.cache.set(lang, (m = new Map()));
    return m;
  }

  async setLang(lang: string) {
    this.lang = lang;
    this.pending.clear();
    this.queue.clear();
    this.failedAt.clear();
    if (!this.loaded.has(lang) && lang !== 'en') {
      const saved = await getItem<Record<string, string>>(KEYS.trCache(lang), {});
      const m = this.map(lang);
      for (const [k, v] of Object.entries(saved)) if (!m.has(k)) m.set(k, v);
      this.loaded.add(lang);
    }
    this.emit();
  }

  get(text: string): string | undefined {
    if (this.lang === 'en') return text;
    return this.map().get(text);
  }

  isPending(text: string) {
    return this.lang !== 'en' && !this.map().has(text) && !this.isFailed(text);
  }

  private isFailed(text: string) {
    const t = this.failedAt.get(text);
    return t !== undefined && Date.now() - t < 30_000;
  }

  /** Ask for a translation (no-op if cached, pending, or recently failed). */
  request(text: string) {
    if (this.lang === 'en' || !text || !/[A-Za-z]/.test(text)) return;
    if (this.map().has(text) || this.pending.has(text) || this.isFailed(text)) return;
    this.queue.add(text);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 40);
  }

  private async flush() {
    this.timer = null;
    const lang = this.lang;
    const batch = [...this.queue].slice(0, 40);
    batch.forEach((t) => {
      this.queue.delete(t);
      this.pending.add(t);
    });
    if (this.queue.size) this.timer = setTimeout(() => this.flush(), 40);
    if (!batch.length) return;
    try {
      const r = await api<{ translations: (string | null)[] }>('/api/translate', {
        body: { texts: batch, target: lang },
        timeoutMs: 30_000,
      });
      if (lang !== this.lang) return;
      batch.forEach((t, i) => {
        const out = r.translations[i];
        if (out) this.map(lang).set(t, out);
        else this.failedAt.set(t, Date.now());
      });
      this.scheduleSave(lang);
    } catch {
      batch.forEach((t) => this.failedAt.set(t, Date.now()));
    } finally {
      batch.forEach((t) => this.pending.delete(t));
      this.emit();
    }
  }

  private scheduleSave(lang: string) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      setItem(KEYS.trCache(lang), Object.fromEntries(this.map(lang)));
    }, 1500);
  }

  /** Translate now (used before speaking). Falls back to the original text. */
  async translateNow(texts: string[]): Promise<string[]> {
    const lang = this.lang;
    if (lang === 'en') return texts;
    const missing = [...new Set(texts.filter((t) => t && !this.map(lang).has(t) && /[A-Za-z]/.test(t)))];
    if (missing.length) {
      try {
        const r = await api<{ translations: (string | null)[] }>('/api/translate', {
          body: { texts: missing, target: lang },
          timeoutMs: 30_000,
        });
        missing.forEach((t, i) => {
          const out = r.translations[i];
          if (out) this.map(lang).set(t, out);
        });
        this.scheduleSave(lang);
        this.emit();
      } catch {
        /* fall back to original */
      }
    }
    return texts.map((t) => this.map(lang).get(t) ?? t);
  }

  /** Warm the cache, e.g. with the whole UI dictionary right after picking a language. */
  prefetch(texts: string[]) {
    texts.forEach((t) => this.request(t));
  }
}

export const engine = new TranslationEngine();
