/**
 * DAY BOUNDARIES
 * ---------------
 * All "days" (streaks, daily XP, the 7-day chart) use the SERVER's local time zone,
 * i.e. the clock of the laptop running this server. A day runs from 00:00:00 to
 * 23:59:59 local time. Weeks (for the weekly leaderboard) start on Monday 00:00 local time.
 * For a village demo the laptop and the phones are in the same place, so this is the
 * simplest correct choice.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" for the given date in server local time. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return dayKey(dt);
}

/** Timestamp (ms) of the most recent Monday 00:00 local time. */
export function weekStartMs(now: Date = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** Last n day keys, oldest first, ending today. */
export function lastNDays(n: number): string[] {
  const today = dayKey();
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}
