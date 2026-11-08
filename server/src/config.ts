import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

export const config = {
  port: Number(process.env.PORT || 4000),
  geminiKey: process.env.GEMINI_API_KEY?.trim() || '',
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest',
  sarvamKey: process.env.SARVAM_API_KEY?.trim() || '',
  dbPath: path.join(ROOT, 'vaie.db'),
  cacheDir: path.join(ROOT, 'cache'),
  seedDir: path.join(ROOT, 'seed'),
  /** Every upstream AI call is aborted after this many ms so one stuck call can't freeze the app. */
  upstreamTimeoutMs: 20_000,
  /** Testing aid: every lesson in the FIRST chapter of each subject is open. Set DEMO_UNLOCK_FIRST_CHAPTER=1. */
  demoUnlockFirstChapter: /^(1|true|yes)$/i.test(process.env.DEMO_UNLOCK_FIRST_CHAPTER?.trim() ?? ''),
};
