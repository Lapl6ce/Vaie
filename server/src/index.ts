import express from 'express';
import cors from 'cors';
import multer from 'multer';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, ROOT } from './config.ts';
import { db, getProfile } from './db.ts';
import { HttpError, asyncRoute, rateLimit } from './util.ts';
import * as game from './game.ts';
import { LANGS, VOICE_LANGS, stt, translateBatch, translateFree, tts, ttsDir } from './sarvam.ts';
import { assistant, detectIntent, explainDifferently, ocrTranslate } from './ai.ts';
import { runSeed } from './seed.ts';

const app = express();
app.set('trust proxy', false);
app.use(cors());
app.use(express.json({ limit: '12mb' })); // photos arrive as base64
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path}`);
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const aiLimit = rateLimit(40); // Gemini calls per phone per minute
const langLimit = rateLimit(400); // translation / audio calls per phone per minute

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const pidOf = (req: express.Request) => {
  const pid = str(req.query.profileId) || str(req.body?.profileId);
  if (!pid || !getProfile(pid)) throw new HttpError(404, 'Profile not found', 'no_profile');
  return pid;
};

// ------------------------------------------------------------------ health & languages
app.get('/api/health', (_req, res) => {
  const content = db.prepare('SELECT COUNT(*) n FROM units').get() as { n: number };
  res.json({ ok: true, name: 'Vaie town hall server', gemini: !!config.geminiKey, sarvam: !!config.sarvamKey, units: content.n });
});

app.get('/api/languages', (_req, res) => {
  res.json(Object.keys(LANGS).map((code) => ({ code, translate: true, voice: VOICE_LANGS.has(code) })));
});

// ------------------------------------------------------------------ profiles
app.get('/api/profiles', (_req, res) => {
  const rows = db.prepare('SELECT * FROM profiles WHERE is_demo_seed = 0 ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/profiles', (req, res) => {
  const b = req.body ?? {};
  const name = str(b.name).trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Name is required');
  const mode = b.mode === 'adult' ? 'adult' : 'student';
  const cls = mode === 'student' && [8, 9, 10, 11, 12].includes(Number(b.class)) ? Number(b.class) : null;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO profiles (id, name, avatar, mode, class, village, language, created_at) VALUES (?,?,?,?,?,?,?,?)').run(
    id,
    name,
    str(b.avatar) || '🦁',
    mode,
    cls,
    str(b.village).trim().slice(0, 40) || 'Rampur',
    str(b.language) || 'en',
    Date.now(),
  );
  res.json(getProfile(id));
});

app.get('/api/profiles/:id', (req, res) => {
  const p = getProfile(req.params.id);
  if (!p) throw new HttpError(404, 'Profile not found', 'no_profile');
  res.json(p);
});

app.patch('/api/profiles/:id', (req, res) => {
  const p = getProfile(req.params.id);
  if (!p) throw new HttpError(404, 'Profile not found', 'no_profile');
  const b = req.body ?? {};
  db.prepare('UPDATE profiles SET name = ?, avatar = ?, class = ?, village = ?, language = ? WHERE id = ?').run(
    str(b.name) || p.name,
    str(b.avatar) || p.avatar,
    b.class === undefined ? p.class : b.class,
    str(b.village) || p.village,
    str(b.language) || p.language,
    p.id,
  );
  res.json(getProfile(p.id));
});

// ------------------------------------------------------------------ learning
app.get('/api/curriculum', (req, res) => {
  res.json(game.curriculum(Number(req.query.class) || 9));
});

app.get('/api/path', (req, res) => {
  res.json(game.path(pidOf(req), Number(req.query.class) || 9, str(req.query.subject) || 'Science'));
});

app.get('/api/units', (req, res) => {
  // flat list of units for a class (used to let voice commands open a lesson by name)
  res.json(
    db
      .prepare('SELECT u.id, u.title, c.subject FROM units u JOIN chapters c ON c.id = u.chapter_id WHERE c.class = ? ORDER BY c.subject, c.ord, u.ord')
      .all(Number(req.query.class) || 9),
  );
});

app.get('/api/units/:id', (req, res) => {
  res.json(game.unitDetail(req.params.id));
});

app.get('/api/chapters/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id);
  if (!c) throw new HttpError(404, 'Chapter not found');
  res.json(c);
});

app.get('/api/quiz', (req, res) => {
  const kind = req.query.kind === 'chapter' ? 'chapter' : 'unit';
  res.json(game.drawQuiz(kind, str(req.query.refId)));
});

app.post('/api/quiz/submit', (req, res) => {
  const b = req.body ?? {};
  const answers = Array.isArray(b.answers) ? b.answers.map((a: any) => ({ qid: str(a.qid), key: Number(a.key) })) : [];
  res.json(game.submitQuiz(pidOf(req), b.kind === 'chapter' ? 'chapter' : 'unit', str(b.refId), answers));
});

// Snakes & Ladders chapter test: the full question pool (with difficulty) and saved game results.
app.get('/api/game', (req, res) => res.json(game.drawGame(pidOf(req), str(req.query.chapterId))));
app.post('/api/game/result', (req, res) => {
  const b = req.body ?? {};
  const players = Array.isArray(b.players) ? b.players : [];
  res.json(game.saveGameResult(pidOf(req), str(b.chapterId), str(b.mode), players, b.winner ? str(b.winner) : null));
});

app.get('/api/summary', (req, res) => res.json(game.summary(pidOf(req))));
app.get('/api/stats', (req, res) => res.json(game.stats(pidOf(req))));
app.get('/api/leaderboard', (req, res) => {
  const scope = (['all', 'class', 'village'] as const).find((s) => s === req.query.scope) ?? 'all';
  res.json(game.leaderboard(pidOf(req), scope, str(req.query.subject) || undefined));
});

// ------------------------------------------------------------------ language layer (Sarvam)
app.post(
  '/api/translate',
  langLimit,
  asyncRoute(async (req, res) => {
    const texts: string[] = Array.isArray(req.body?.texts) ? req.body.texts.slice(0, 100).map(String) : [];
    const target = str(req.body?.target);
    const source = str(req.body?.source) || 'en';
    res.json({ translations: await translateBatch(texts, target, source) });
  }),
);

app.post(
  '/api/translate/free',
  langLimit,
  asyncRoute(async (req, res) => {
    const text = str(req.body?.text).slice(0, 4000);
    if (!text.trim()) throw new HttpError(400, 'Nothing to translate');
    res.json(await translateFree(text, str(req.body?.target) || 'hi'));
  }),
);

app.post(
  '/api/tts',
  langLimit,
  asyncRoute(async (req, res) => {
    const lang = str(req.body?.lang) || 'en';
    const files = await tts(str(req.body?.text), lang);
    res.json({ urls: files.map((f) => `/audio/${f}`) });
  }),
);
app.use('/audio', express.static(ttsDir, { maxAge: '7d', immutable: true }));

app.post(
  '/api/stt',
  langLimit,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No audio received');
    const lang = str(req.body?.lang);
    const out = await stt(req.file.buffer, req.file.mimetype, req.file.originalname || 'audio.m4a', LANGS[lang] ? lang : null);
    res.json({ transcript: out.transcript ?? '', language: out.language_code ?? null });
  }),
);

// ------------------------------------------------------------------ AI (Gemini)
app.post('/api/ai/intent', aiLimit, asyncRoute(async (req, res) => res.json(await detectIntent(req.body ?? {}))));
app.post('/api/ai/assistant', aiLimit, asyncRoute(async (req, res) => res.json(await assistant(req.body ?? {}))));
app.post(
  '/api/ai/explain',
  aiLimit,
  asyncRoute(async (req, res) => res.json(await explainDifferently(str(req.body?.unitId), req.body?.wrong ?? []))),
);
app.post(
  '/api/ai/ocr',
  aiLimit,
  asyncRoute(async (req, res) =>
    res.json(await ocrTranslate(str(req.body?.image), str(req.body?.mime), str(req.body?.target) || 'hi')),
  ),
);

// ------------------------------------------------------------------ errors
app.use((req, res) => res.status(404).json({ error: `No route ${req.method} ${req.path}` }));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server', code: 'internal' });
});

// ------------------------------------------------------------------ start
function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

/** Write app/.env so the Expo app finds this server automatically (only if absent or auto-generated). */
function writeAppEnv(url: string) {
  const envPath = path.resolve(ROOT, '..', 'app', '.env');
  const marker = '# auto-written by the Vaie server';
  try {
    if (fs.existsSync(envPath) && !fs.readFileSync(envPath, 'utf8').startsWith(marker)) return;
    fs.writeFileSync(envPath, `${marker} (delete this line to stop auto-updates)\nEXPO_PUBLIC_SERVER_URL=${url}\n`);
  } catch {
    /* not fatal */
  }
}

// First run: load the lessons automatically so beginners can't forget `npm run seed`.
if ((db.prepare('SELECT COUNT(*) n FROM units').get() as { n: number }).n === 0) runSeed();
const count = (db.prepare('SELECT COUNT(*) n FROM units').get() as { n: number }).n;
app.listen(config.port, '0.0.0.0', () => {
  const ips = lanAddresses();
  const url = ips[0] ? `http://${ips[0]}:${config.port}` : `http://localhost:${config.port}`;
  writeAppEnv(url);
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  🏡 Vaie town hall server is running\n`);
  for (const ip of ips) console.log(`  Phone URL:  http://${ip}:${config.port}`);
  console.log(`  This laptop: http://localhost:${config.port}/api/health\n`);
  console.log(`  Gemini key: ${config.geminiKey ? '✅' : '❌ missing (set GEMINI_API_KEY in server/.env)'}   model: ${config.geminiModel}`);
  console.log(`  Sarvam key: ${config.sarvamKey ? '✅' : '❌ missing (set SARVAM_API_KEY in server/.env)'}`);
  console.log(`  Lessons loaded: ${count}${count ? '' : '  ⚠️  run "npm run seed" first'}`);
  if (ips.length > 1) console.log(`\n  Several networks found — use the one on the same Wi-Fi as the phone.`);
  console.log(`${line}\n`);
});
