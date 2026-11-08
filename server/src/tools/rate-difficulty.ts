/**
 * One-off content tool: rates every seed question 1 (easy), 2 (medium) or 3 (hard) with Gemini
 * and writes the rating as a 5th element of each question tuple in seed/content/*.json.
 * The Snakes & Ladders chapter test picks questions by difficulty from the die roll.
 *
 *   npx tsx src/tools/rate-difficulty.ts          # rate questions that have no rating yet
 *   npx tsx src/tools/rate-difficulty.ts --force  # re-rate everything
 *
 * Questions are rated a lesson at a time and relative to each other, so every lesson (and so
 * every chapter) ends up with a spread of easy, medium and hard questions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { geminiJSON } from '../gemini.ts';

type QTuple = [string, string[], number, string, number?];
const force = process.argv.includes('--force');
const dir = path.join(config.seedDir, 'content');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const full = path.join(dir, file);
  const text = fs.readFileSync(full, 'utf8');
  const data = JSON.parse(text) as { class: number; subject: string; chapters: { units: { id: string; title: string; questions: QTuple[] }[] }[] };
  const units = data.chapters.flatMap((c) => c.units);
  const all = units.flatMap((u) => u.questions);
  let ratings: number[];
  if (!force && all.every((q) => q[4] === 1 || q[4] === 2 || q[4] === 3)) {
    ratings = all.map((q) => q[4] as number);
  } else {
    // One request per subject file: the free Gemini tier allows only ~5 requests a minute.
    const list = units
      .map((u) => `## Lesson ${u.id}: ${u.title}\n` + u.questions.map((q, i) => `${u.id}#${i + 1}. ${q[0]} | options: ${q[1].join(' / ')} | answer: ${q[1][q[2]]}`).join('\n'))
      .join('\n\n');
    const ask = () =>
      geminiJSON<{ ratings: number[] }>({
        system: `You rate quiz questions for Indian Class ${data.class} ${data.subject} students (CBSE).
1 = easy: direct recall of a fact or definition.
2 = medium: needs understanding, or one simple step of reasoning or calculation.
3 = hard: applying the idea to a new situation, or several steps.
Within EACH lesson, rate the questions relative to each other and use all three levels, roughly a third each.
Return exactly one rating per question, in the order given (${all.length} ratings in total).`,
        parts: [{ text: list }],
        schema: { type: 'OBJECT', properties: { ratings: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['ratings'] },
        temperature: 0,
        timeoutMs: 90_000,
      });
    let out: { ratings: number[] } | null = null;
    for (let attempt = 0; attempt < 4 && !out; attempt++) {
      try {
        out = await ask();
      } catch (e: any) {
        if (e?.status !== 429 || attempt === 3) throw e;
        console.log('Rate limited by Gemini, waiting 65 s…');
        await new Promise((r) => setTimeout(r, 65_000));
      }
    }
    if (!out || out.ratings.length !== all.length) throw new Error(`${file}: got ${out?.ratings.length} ratings for ${all.length} questions`);
    ratings = out.ratings.map((r) => Math.min(3, Math.max(1, Math.round(r))));
  }

  // Rewrite only the question lines (one tuple per line) so the file keeps its hand-made layout.
  let i = 0;
  const lines = text.split('\n').map((line) => {
    const m = /^(\s*)(\[".*\])(,?)\s*$/.exec(line);
    if (!m) return line;
    const tuple = JSON.parse(m[2]) as QTuple;
    if (!Array.isArray(tuple[1]) || typeof tuple[2] !== 'number') return line;
    const d = ratings[i++];
    const opts = tuple[1].map((o) => JSON.stringify(o)).join(', ');
    return `${m[1]}[${JSON.stringify(tuple[0])}, [${opts}], ${tuple[2]}, ${JSON.stringify(tuple[3])}, ${d}]${m[3]}`;
  });
  if (i !== ratings.length) throw new Error(`${file}: matched ${i} question lines but have ${ratings.length} ratings`);
  fs.writeFileSync(full, lines.join('\n'));
  const counts = [1, 2, 3].map((d) => ratings.filter((r) => r === d).length);
  console.log(`✅ ${file}: easy ${counts[0]}, medium ${counts[1]}, hard ${counts[2]}`);
}
