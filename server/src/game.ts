import { db, getProfile } from './db.ts';
import { addDays, dayKey, lastNDays, weekStartMs } from './time.ts';
import { HttpError, shuffle } from './util.ts';
import { config } from './config.ts';

// ------------------------------------------------------------------ rules
export const RULES = {
  unitQuizSize: 5,
  unitPassPct: 0.8, // mastery gate: 4/5
  chapterTestSize: 10,
  chapterPassPct: 0.7,
  /** Taking a chapter test before finishing its lessons: score this much to skip the whole module. */
  chapterSkipPassPct: 0.9,
  xpPerCorrect: 10,
  xpFirstTryPass: 20,
  xpPerfect: 15,
  xpChapterPass: 50,
  xpPerFreeze: 250, // earn one streak freeze per 250 XP
  maxFreezes: 2,
};

/** Level n starts at 50*n*(n-1) XP: L1=0, L2=100, L3=300, L4=600, L5=1000 ... */
export function levelInfo(xp: number) {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const start = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, xp, levelStart: start, nextLevelAt: next, progress: (xp - start) / (next - start) };
}

export const BADGES = [
  { id: 'first_unit', title: 'First Unit', icon: 'flag-checkered', desc: 'Passed your first unit' },
  { id: 'streak_3', title: '3-Day Streak', icon: 'fire', desc: 'Learned 3 days in a row' },
  { id: 'perfect', title: 'Perfect Score', icon: 'star-circle', desc: 'Got every answer right' },
  { id: 'chapter_master', title: 'Chapter Master', icon: 'crown', desc: 'Passed a chapter test' },
  { id: 'night_owl', title: 'Night Owl', icon: 'owl', desc: 'Studied after 9 at night' },
  { id: 'comeback', title: 'Never Give Up', icon: 'arm-flex', desc: 'Passed after trying again' },
  { id: 'xp_500', title: 'Rising Star', icon: 'rocket-launch', desc: 'Earned 500 XP' },
] as const;

export function totalXp(pid: string): number {
  return (db.prepare('SELECT COALESCE(SUM(amount),0) s FROM xp_events WHERE profile_id = ?').get(pid) as { s: number }).s;
}

// ------------------------------------------------------------------ streaks
function activeDays(pid: string): Map<string, boolean> {
  const rows = db.prepare('SELECT day, frozen FROM activity_days WHERE profile_id = ? ORDER BY day').all(pid) as {
    day: string;
    frozen: number;
  }[];
  return new Map(rows.map((r) => [r.day, !!r.frozen]));
}

/** Marks today as active. If exactly one day was missed and a freeze is available, the freeze covers it. */
function recordActivity(pid: string) {
  const today = dayKey();
  const days = activeDays(pid);
  if (days.has(today)) return;
  const yesterday = addDays(today, -1);
  const p = getProfile(pid)!;
  if (!days.has(yesterday) && days.has(addDays(today, -2)) && p.freezes > 0) {
    db.prepare('INSERT OR IGNORE INTO activity_days (profile_id, day, frozen) VALUES (?,?,1)').run(pid, yesterday);
    db.prepare('UPDATE profiles SET freezes = freezes - 1 WHERE id = ?').run(pid);
  }
  db.prepare('INSERT OR IGNORE INTO activity_days (profile_id, day, frozen) VALUES (?,?,0)').run(pid, today);
}

export function streakInfo(pid: string) {
  const days = activeDays(pid);
  const today = dayKey();
  let cur = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    cur++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev = '';
  for (const day of [...days.keys()].sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  const week = lastNDays(7).map((day) => ({
    day,
    status: days.has(day) ? (days.get(day) ? 'frozen' : 'done') : day === today ? 'today' : 'missed',
  }));
  const p = getProfile(pid);
  return { current: cur, best: Math.max(best, cur), activeToday: days.has(today), week, freezes: p?.freezes ?? 0 };
}

function grantFreezes(pid: string) {
  const p = getProfile(pid)!;
  const xp = totalXp(pid);
  const earned = Math.floor((xp - p.freeze_xp_mark) / RULES.xpPerFreeze);
  if (earned > 0) {
    db.prepare('UPDATE profiles SET freezes = MIN(?, freezes + ?), freeze_xp_mark = freeze_xp_mark + ? WHERE id = ?').run(
      RULES.maxFreezes,
      earned,
      earned * RULES.xpPerFreeze,
      pid,
    );
  }
}

// ------------------------------------------------------------------ curriculum & path
type ChapterRow = { id: string; class: number; subject: string; title: string; ord: number };
type UnitRow = { id: string; chapter_id: string; ord: number; title: string; body: string; key_idea: string; icon: string };

export function curriculum(cls: number) {
  const rows = db
    .prepare('SELECT subject, COUNT(*) n FROM chapters WHERE class = ? GROUP BY subject ORDER BY subject DESC')
    .all(cls) as { subject: string; n: number }[];
  return rows;
}

export function path(pid: string, cls: number, subject: string) {
  const chapters = db.prepare('SELECT * FROM chapters WHERE class = ? AND subject = ? ORDER BY ord').all(cls, subject) as ChapterRow[];
  const up = new Map(
    (db.prepare('SELECT * FROM unit_progress WHERE profile_id = ?').all(pid) as any[]).map((r) => [r.unit_id, r]),
  );
  const cp = new Map(
    (db.prepare('SELECT * FROM chapter_progress WHERE profile_id = ?').all(pid) as any[]).map((r) => [r.chapter_id, r]),
  );
  let prevChapterPassed = true;
  return chapters.map((ch) => {
    const units = db.prepare('SELECT id, title, ord, icon FROM units WHERE chapter_id = ? ORDER BY ord').all(ch.id) as UnitRow[];
    const demoOpen = config.demoUnlockFirstChapter && ch.ord === 0;
    let prevPassed = prevChapterPassed;
    const unitNodes = units.map((u) => {
      const p = up.get(u.id);
      const status = p?.passed ? 'completed' : prevPassed || demoOpen ? 'current' : 'locked';
      prevPassed = !!p?.passed;
      return { id: u.id, title: u.title, icon: u.icon, status, stars: p?.stars ?? 0 };
    });
    const allPassed = unitNodes.every((u) => u.status === 'completed');
    const chp = cp.get(ch.id);
    // The chapter test is always open. Taking it before the lessons are done is a "skip test":
    // it needs a higher score, and passing it completes the whole module.
    const early = !allPassed || !prevChapterPassed;
    const testStatus = chp?.passed ? 'completed' : 'current';
    const node = {
      id: ch.id,
      title: ch.title,
      locked: !prevChapterPassed && !demoOpen,
      units: unitNodes,
      test: {
        status: testStatus,
        bestScore: chp?.best_score ?? 0,
        early: !chp?.passed && early,
        passPct: early ? RULES.chapterSkipPassPct : RULES.chapterPassPct,
      },
    };
    prevChapterPassed = !!chp?.passed;
    return node;
  });
}

export function unitDetail(unitId: string) {
  const u = db
    .prepare(
      `SELECT u.*, c.title chapter_title, c.class, c.subject FROM units u JOIN chapters c ON c.id = u.chapter_id WHERE u.id = ?`,
    )
    .get(unitId) as (UnitRow & { chapter_title: string; class: number; subject: string }) | undefined;
  if (!u) throw new HttpError(404, 'Unit not found');
  return u;
}

// ------------------------------------------------------------------ quizzes
type QRow = { id: string; unit_id: string; q: string; options: string; answer: number; explanation: string };

function publicQuestion(q: QRow) {
  const opts = (JSON.parse(q.options) as string[]).map((text, key) => ({ text, key }));
  // The answer key is included so the app can give instant right/wrong feedback (fine for a demo);
  // the server still grades the submission itself.
  return { id: q.id, q: q.q, options: shuffle(opts), answerKey: q.answer, explanation: q.explanation };
}

/** Is this chapter test being taken before the module is finished (lessons or previous chapter)? */
export function chapterEarly(pid: string, chapterId: string) {
  const c = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId) as ChapterRow | undefined;
  if (!c) throw new HttpError(404, 'Chapter not found');
  const left = db
    .prepare(
      `SELECT COUNT(*) n FROM units u LEFT JOIN unit_progress p ON p.unit_id = u.id AND p.profile_id = ?
       WHERE u.chapter_id = ? AND COALESCE(p.passed, 0) = 0`,
    )
    .get(pid, chapterId) as { n: number };
  const prev = db
    .prepare('SELECT id FROM chapters WHERE class = ? AND subject = ? AND ord < ? ORDER BY ord DESC LIMIT 1')
    .get(c.class, c.subject, c.ord) as { id: string } | undefined;
  const prevPassed = !prev || !!(db.prepare('SELECT passed FROM chapter_progress WHERE profile_id = ? AND chapter_id = ?').get(pid, prev.id) as any)?.passed;
  const alreadyPassed = !!(db.prepare('SELECT passed FROM chapter_progress WHERE profile_id = ? AND chapter_id = ?').get(pid, chapterId) as any)?.passed;
  return { chapter: c, early: !alreadyPassed && (left.n > 0 || !prevPassed) };
}

/** Whole question pool for a chapter, with difficulty, for the Snakes & Ladders test. */
export function drawGame(pid: string, chapterId: string) {
  const { early } = chapterEarly(pid, chapterId);
  const qs = db
    .prepare('SELECT q.* FROM questions q JOIN units u ON u.id = q.unit_id WHERE u.chapter_id = ?')
    .all(chapterId) as (QRow & { difficulty: number })[];
  if (!qs.length) throw new HttpError(404, 'Chapter not found');
  return {
    chapterId,
    early,
    passPct: early ? RULES.chapterSkipPassPct : RULES.chapterPassPct,
    questions: shuffle(qs).map((q) => ({ ...publicQuestion(q), difficulty: q.difficulty ?? 2 })),
  };
}

export type GamePlayer = { name: string; avatar: string; isAi: boolean; moves: number; correct: number; asked: number; position: number; rank: number };

export function saveGameResult(pid: string, chapterId: string, mode: string, players: GamePlayer[], winner: string | null) {
  if (!getProfile(pid)) throw new HttpError(404, 'Profile not found');
  const clean = players.slice(0, 6).map((p) => ({
    name: String(p.name ?? '').slice(0, 40),
    avatar: String(p.avatar ?? '').slice(0, 8),
    isAi: !!p.isAi,
    moves: Math.max(0, Math.round(Number(p.moves) || 0)),
    correct: Math.max(0, Math.round(Number(p.correct) || 0)),
    asked: Math.max(0, Math.round(Number(p.asked) || 0)),
    position: Math.max(0, Math.min(100, Math.round(Number(p.position) || 0))),
    rank: Math.max(1, Math.round(Number(p.rank) || 1)),
  }));
  const r = db
    .prepare('INSERT INTO game_results (profile_id, chapter_id, mode, players, winner, created_at) VALUES (?,?,?,?,?,?)')
    .run(pid, chapterId, mode === 'versus' ? 'versus' : 'solo', JSON.stringify(clean), winner, Date.now());
  // Personal best: fewest moves to finish this chapter's board.
  const rows = db
    .prepare('SELECT players FROM game_results WHERE profile_id = ? AND chapter_id = ?')
    .all(pid, chapterId) as { players: string }[];
  let bestMoves: number | null = null;
  for (const row of rows) {
    const me = (JSON.parse(row.players) as GamePlayer[]).find((p) => !p.isAi);
    if (me && me.position >= 100 && (bestMoves === null || me.moves < bestMoves)) bestMoves = me.moves;
  }
  return { id: Number(r.lastInsertRowid), bestMoves, games: rows.length };
}

export function drawQuiz(kind: 'unit' | 'chapter', refId: string) {
  if (kind === 'unit') {
    unitDetail(refId);
    const qs = db.prepare('SELECT * FROM questions WHERE unit_id = ?').all(refId) as QRow[];
    return { kind, refId, passPct: RULES.unitPassPct, questions: shuffle(qs).slice(0, RULES.unitQuizSize).map(publicQuestion) };
  }
  const units = db.prepare('SELECT id FROM units WHERE chapter_id = ? ORDER BY ord').all(refId) as { id: string }[];
  if (!units.length) throw new HttpError(404, 'Chapter not found');
  // round-robin across units so the test covers the whole chapter
  const pools = units.map((u) => shuffle(db.prepare('SELECT * FROM questions WHERE unit_id = ?').all(u.id) as QRow[]));
  const picked: QRow[] = [];
  for (let i = 0; picked.length < RULES.chapterTestSize && i < 20; i++) {
    for (const pool of pools) if (pool[i] && picked.length < RULES.chapterTestSize) picked.push(pool[i]);
  }
  return { kind, refId, passPct: RULES.chapterPassPct, questions: shuffle(picked).map(publicQuestion) };
}

export function submitQuiz(pid: string, kind: 'unit' | 'chapter', refId: string, answers: { qid: string; key: number }[]) {
  const profile = getProfile(pid);
  if (!profile) throw new HttpError(404, 'Profile not found');
  const getQ = db.prepare('SELECT * FROM questions WHERE id = ?');
  const results = answers.map((a) => {
    const q = getQ.get(a.qid) as QRow | undefined;
    if (!q) throw new HttpError(400, 'Unknown question');
    return {
      qid: q.id,
      q: q.q,
      options: JSON.parse(q.options) as string[],
      chosenKey: a.key,
      correctKey: q.answer,
      correct: a.key === q.answer,
      explanation: q.explanation,
    };
  });
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const early = kind === 'chapter' && chapterEarly(pid, refId).early;
  const passPct = kind === 'unit' ? RULES.unitPassPct : early ? RULES.chapterSkipPassPct : RULES.chapterPassPct;
  const passed = total > 0 && correct / total >= passPct - 1e-9;
  const perfect = correct === total && total > 0;

  let chapterId: string;
  let title: string;
  let subject: string;
  let cls: number;
  if (kind === 'unit') {
    const u = unitDetail(refId);
    chapterId = u.chapter_id;
    title = u.title;
    subject = u.subject;
    cls = u.class;
  } else {
    const c = db.prepare('SELECT * FROM chapters WHERE id = ?').get(refId) as ChapterRow;
    chapterId = c.id;
    title = c.title + ' — Chapter test';
    subject = c.subject;
    cls = c.class;
  }

  const prev =
    kind === 'unit'
      ? (db.prepare('SELECT * FROM unit_progress WHERE profile_id = ? AND unit_id = ?').get(pid, refId) as any)
      : (db.prepare('SELECT * FROM chapter_progress WHERE profile_id = ? AND chapter_id = ?').get(pid, refId) as any);
  const alreadyPassed = !!prev?.passed;
  const firstTry = !prev || prev.attempts === 0;

  const xpBefore = totalXp(pid);
  const levelBefore = levelInfo(xpBefore).level;
  const breakdown: { label: string; xp: number }[] = [];
  breakdown.push({ label: 'Correct answers', xp: correct * RULES.xpPerCorrect });
  if (passed && firstTry && !alreadyPassed) breakdown.push({ label: 'First-try pass', xp: RULES.xpFirstTryPass });
  if (perfect && !alreadyPassed) breakdown.push({ label: 'Perfect score', xp: RULES.xpPerfect });
  if (kind === 'chapter' && passed && !alreadyPassed) breakdown.push({ label: early ? 'Module skipped' : 'Chapter passed', xp: RULES.xpChapterPass });
  const xpGained = breakdown.reduce((s, b) => s + b.xp, 0);
  const stars = passed ? (perfect ? 3 : firstTry ? 2 : 1) : 0;
  const now = Date.now();

  const tx = db.transaction(() => {
    if (xpGained > 0) {
      db.prepare('INSERT INTO xp_events (profile_id, amount, reason, subject, class, day, created_at) VALUES (?,?,?,?,?,?,?)').run(
        pid,
        xpGained,
        kind,
        subject,
        cls,
        dayKey(),
        now,
      );
    }
    db.prepare(
      'INSERT INTO attempts (profile_id, kind, ref_id, title, subject, class, correct, total, passed, xp, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(pid, kind, refId, title, subject, cls, correct, total, passed ? 1 : 0, xpGained, now);
    const score = Math.round((correct / Math.max(total, 1)) * 100);
    if (kind === 'unit') {
      db.prepare(
        `INSERT INTO unit_progress (profile_id, unit_id, passed, stars, best_score, attempts) VALUES (?,?,?,?,?,1)
         ON CONFLICT(profile_id, unit_id) DO UPDATE SET passed = MAX(passed, excluded.passed), stars = MAX(stars, excluded.stars),
         best_score = MAX(best_score, excluded.best_score), attempts = attempts + 1`,
      ).run(pid, refId, passed ? 1 : 0, stars, score);
    } else {
      db.prepare(
        `INSERT INTO chapter_progress (profile_id, chapter_id, passed, best_score, attempts) VALUES (?,?,?,?,1)
         ON CONFLICT(profile_id, chapter_id) DO UPDATE SET passed = MAX(passed, excluded.passed),
         best_score = MAX(best_score, excluded.best_score), attempts = attempts + 1`,
      ).run(pid, refId, passed ? 1 : 0, score);
      // Skip test passed: every lesson in the module counts as done.
      if (passed && early) {
        db.prepare(
          `INSERT INTO unit_progress (profile_id, unit_id, passed, stars, best_score, attempts)
           SELECT ?, id, 1, 1, ?, 0 FROM units WHERE chapter_id = ?
           ON CONFLICT(profile_id, unit_id) DO UPDATE SET passed = 1, stars = MAX(stars, 1)`,
        ).run(pid, score, refId);
      }
    }
    recordActivity(pid); // any completed quiz counts for the daily streak
    grantFreezes(pid);
  });
  tx();

  const xpAfter = totalXp(pid);
  const levelAfter = levelInfo(xpAfter);
  const streak = streakInfo(pid);

  // badges
  const earned = new Set((db.prepare('SELECT badge_id FROM badges WHERE profile_id = ?').all(pid) as any[]).map((r) => r.badge_id));
  const hour = new Date().getHours();
  const want: string[] = [];
  if (passed && kind === 'unit') want.push('first_unit');
  if (streak.current >= 3) want.push('streak_3');
  if (perfect) want.push('perfect');
  if (passed && kind === 'chapter') want.push('chapter_master');
  if (hour >= 21 || hour < 5) want.push('night_owl');
  if (passed && !firstTry) want.push('comeback');
  if (xpAfter >= 500) want.push('xp_500');
  const newBadges = BADGES.filter((b) => want.includes(b.id) && !earned.has(b.id));
  for (const b of newBadges) db.prepare('INSERT OR IGNORE INTO badges VALUES (?,?,?)').run(pid, b.id, now);

  // what got unlocked?
  let unlocked: string | null = null;
  if (passed && !alreadyPassed) {
    if (kind === 'unit') {
      const next = db
        .prepare('SELECT title FROM units WHERE chapter_id = ? AND ord > (SELECT ord FROM units WHERE id = ?) ORDER BY ord LIMIT 1')
        .get(chapterId, refId) as { title: string } | undefined;
      unlocked = next ? next.title : 'Chapter test';
    } else {
      const c = db.prepare('SELECT * FROM chapters WHERE id = ?').get(refId) as ChapterRow;
      const next = db
        .prepare('SELECT title FROM chapters WHERE class = ? AND subject = ? AND ord > ? ORDER BY ord LIMIT 1')
        .get(c.class, c.subject, c.ord) as { title: string } | undefined;
      unlocked = next?.title ?? null;
    }
  }

  return {
    kind,
    refId,
    correct,
    total,
    passed,
    perfect,
    passPct,
    stars,
    results,
    xpGained,
    breakdown,
    levelBefore,
    level: levelAfter,
    leveledUp: levelAfter.level > levelBefore,
    newBadges,
    streak,
    unlocked,
    skipped: passed && early,
  };
}

// ------------------------------------------------------------------ summary / stats
export function summary(pid: string) {
  const p = getProfile(pid);
  if (!p) throw new HttpError(404, 'Profile not found');
  return { profile: p, level: levelInfo(totalXp(pid)), streak: streakInfo(pid) };
}

export function stats(pid: string) {
  const s = summary(pid);
  const bySubject = db
    .prepare('SELECT subject, SUM(correct) c, SUM(total) t, COUNT(*) n FROM attempts WHERE profile_id = ? GROUP BY subject')
    .all(pid) as { subject: string; c: number; t: number; n: number }[];
  const unitsDone = (db.prepare('SELECT COUNT(*) n FROM unit_progress WHERE profile_id = ? AND passed = 1').get(pid) as any).n;
  const unitsTotal = s.profile.class
    ? (db.prepare('SELECT COUNT(*) n FROM units u JOIN chapters c ON c.id = u.chapter_id WHERE c.class = ?').get(s.profile.class) as any).n
    : (db.prepare('SELECT COUNT(*) n FROM units').get() as any).n;
  const history = db
    .prepare('SELECT kind, title, subject, correct, total, passed, xp, created_at FROM attempts WHERE profile_id = ? ORDER BY id DESC LIMIT 10')
    .all(pid);
  const days = lastNDays(7);
  const xpRows = db
    .prepare('SELECT day, SUM(amount) xp FROM xp_events WHERE profile_id = ? AND day >= ? GROUP BY day')
    .all(pid, days[0]) as { day: string; xp: number }[];
  const xpMap = new Map(xpRows.map((r) => [r.day, r.xp]));
  const earned = new Map(
    (db.prepare('SELECT badge_id, earned_at FROM badges WHERE profile_id = ?').all(pid) as any[]).map((r) => [r.badge_id, r.earned_at]),
  );
  return {
    ...s,
    accuracy: bySubject.map((r) => ({ subject: r.subject, pct: r.t ? Math.round((r.c / r.t) * 100) : 0, quizzes: r.n })),
    unitsDone,
    unitsTotal,
    history,
    last7: days.map((day) => ({ day, xp: xpMap.get(day) ?? 0 })),
    badges: BADGES.map((b) => ({ ...b, earned: earned.has(b.id), earnedAt: earned.get(b.id) ?? null })),
  };
}

// ------------------------------------------------------------------ leaderboard

/**
 * Demo peers (profiles.is_demo_seed = 1) get fresh XP for the current week if they have none,
 * so the board always looks alive whenever the demo runs.
 */
function ensureDemoPeersActive() {
  const since = weekStartMs();
  const has = db
    .prepare('SELECT COUNT(*) n FROM xp_events e JOIN profiles p ON p.id = e.profile_id WHERE p.is_demo_seed = 1 AND e.created_at >= ?')
    .get(since) as { n: number };
  if (has.n > 0) return;
  const peers = db.prepare('SELECT * FROM profiles WHERE is_demo_seed = 1').all() as any[];
  const now = Date.now();
  const ins = db.prepare('INSERT INTO xp_events (profile_id, amount, reason, subject, class, day, created_at) VALUES (?,?,?,?,?,?,?)');
  db.transaction(() => {
    for (const p of peers) {
      const sessions = 2 + Math.floor(Math.random() * 6);
      for (let i = 0; i < sessions; i++) {
        const t = since + Math.random() * Math.max(1, now - since - 60_000);
        const amount = 20 + Math.floor(Math.random() * 7) * 10;
        ins.run(p.id, amount, 'demo', Math.random() < 0.5 ? 'Science' : 'Mathematics', p.class, dayKey(new Date(t)), Math.floor(t));
      }
    }
  })();
}

export function leaderboard(pid: string, scope: 'all' | 'class' | 'village', subject?: string) {
  ensureDemoPeersActive();
  const me = getProfile(pid);
  if (!me) throw new HttpError(404, 'Profile not found');
  const since = weekStartMs();
  const where: string[] = ["p.mode = 'student'"];
  const params: unknown[] = [since];
  if (subject) {
    params.push(subject);
  }
  if (scope === 'class' && me.class) {
    where.push('p.class = ?');
    params.push(me.class);
  }
  if (scope === 'village') {
    where.push('p.village = ?');
    params.push(me.village);
  }
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.avatar, p.village, p.class, p.is_demo_seed,
              COALESCE((SELECT SUM(amount) FROM xp_events e WHERE e.profile_id = p.id AND e.created_at >= ? ${
                subject ? 'AND e.subject = ?' : ''
              }), 0) xp
       FROM profiles p WHERE ${where.join(' AND ')} ORDER BY xp DESC, p.name ASC`,
    )
    .all(...params) as any[];
  const list = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    village: r.village,
    class: r.class,
    xp: r.xp,
    isMe: r.id === pid,
    isDemoSeed: !!r.is_demo_seed,
  }));
  return { weekStart: since, scope, subject: subject ?? null, rows: list, me: list.find((r) => r.isMe) ?? null };
}
