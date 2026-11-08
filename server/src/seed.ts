/**
 * Loads curriculum + demo peers into SQLite. Safe to run many times (it replaces content, keeps real profiles).
 *   npm run seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { db } from './db.ts';

/** [question, 4 options, answer index, explanation, difficulty 1 easy | 2 medium | 3 hard] */
type QTuple = [string, string[], number, string, number?];
type SeedFile = {
  class: number;
  subject: string;
  chapters: {
    id: string;
    title: string;
    units: { id: string; title: string; icon: string; key_idea: string; body: string; questions: QTuple[] }[];
  }[];
};

export function runSeed() {
const contentDir = path.join(config.seedDir, 'content');
const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json'));

let chapters = 0;
let units = 0;
let questions = 0;

db.transaction(() => {
  db.exec('DELETE FROM questions; DELETE FROM units; DELETE FROM chapters;');
  const insC = db.prepare('INSERT INTO chapters (id, class, subject, title, ord) VALUES (?,?,?,?,?)');
  const insU = db.prepare('INSERT INTO units (id, chapter_id, ord, title, body, key_idea, icon) VALUES (?,?,?,?,?,?,?)');
  const insQ = db.prepare('INSERT INTO questions (id, unit_id, q, options, answer, explanation, difficulty) VALUES (?,?,?,?,?,?,?)');

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8')) as SeedFile;
    data.chapters.forEach((ch, ci) => {
      insC.run(ch.id, data.class, data.subject, ch.title, ci);
      chapters++;
      ch.units.forEach((u, ui) => {
        insU.run(u.id, ch.id, ui, u.title, u.body, u.key_idea, u.icon);
        units++;
        if (u.questions.length < 5) throw new Error(`${u.id} needs at least 5 questions`);
        u.questions.forEach(([q, options, answer, explanation, difficulty], qi) => {
          if (options.length !== 4 || answer < 0 || answer > 3) throw new Error(`Bad question ${u.id}#${qi}`);
          insQ.run(`${u.id}-q${qi + 1}`, u.id, q, JSON.stringify(options), answer, explanation, difficulty === 1 || difficulty === 3 ? difficulty : 2);
          questions++;
        });
      });
    });
  }

  // Demo peers: fake students so the leaderboard looks alive. Flagged is_demo_seed = 1 (isDemoSeed in the API).
  const peers = JSON.parse(fs.readFileSync(path.join(config.seedDir, 'peers.json'), 'utf8')) as {
    id: string;
    name: string;
    avatar: string;
    class: number;
    village: string;
  }[];
  db.prepare('DELETE FROM xp_events WHERE profile_id IN (SELECT id FROM profiles WHERE is_demo_seed = 1)').run();
  db.prepare('DELETE FROM activity_days WHERE profile_id IN (SELECT id FROM profiles WHERE is_demo_seed = 1)').run();
  db.prepare('DELETE FROM profiles WHERE is_demo_seed = 1').run();
  const insP = db.prepare(
    "INSERT INTO profiles (id, name, avatar, mode, class, village, language, is_demo_seed, created_at) VALUES (?,?,?,'student',?,?,'en',1,?)",
  );
  for (const p of peers) insP.run(p.id, p.name, p.avatar, p.class, p.village, Date.now());
  // Their weekly XP is generated on demand by ensureDemoPeersActive() in game.ts.
})();

console.log(`✅ Seeded ${files.length} subjects, ${chapters} chapters, ${units} units, ${questions} questions, plus demo peers.`);
}

// `npm run seed` runs this file directly.
if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) runSeed();
