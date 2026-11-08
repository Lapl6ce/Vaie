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
};
