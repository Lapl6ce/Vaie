import Database from 'better-sqlite3';
import fs from 'node:fs';
import { config } from './config.ts';

fs.mkdirSync(config.cacheDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('student','adult')),
  class INTEGER,
  village TEXT NOT NULL DEFAULT 'Rampur',
  language TEXT NOT NULL DEFAULT 'en',
  freezes INTEGER NOT NULL DEFAULT 0,
  freeze_xp_mark INTEGER NOT NULL DEFAULT 0,
  is_demo_seed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  class INTEGER NOT NULL,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  ord INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  key_idea TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'book-open-variant'
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  q TEXT NOT NULL,
  options TEXT NOT NULL,
  answer INTEGER NOT NULL,
  explanation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS unit_progress (
  profile_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  passed INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, unit_id)
);
CREATE TABLE IF NOT EXISTS chapter_progress (
  profile_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  passed INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, chapter_id)
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  class INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  subject TEXT,
  class INTEGER,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS xp_events_time ON xp_events (created_at);
CREATE TABLE IF NOT EXISTS activity_days (
  profile_id TEXT NOT NULL,
  day TEXT NOT NULL,
  frozen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, day)
);
CREATE TABLE IF NOT EXISTS badges (
  profile_id TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, badge_id)
);
CREATE TABLE IF NOT EXISTS translations (
  hash TEXT PRIMARY KEY,
  lang TEXT NOT NULL,
  src TEXT NOT NULL,
  out TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

export type Profile = {
  id: string;
  name: string;
  avatar: string;
  mode: 'student' | 'adult';
  class: number | null;
  village: string;
  language: string;
  freezes: number;
  freeze_xp_mark: number;
  is_demo_seed: number;
  created_at: number;
};

export function getProfile(id: string): Profile | undefined {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Profile | undefined;
}
