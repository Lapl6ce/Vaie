export type Mode = 'student' | 'adult';

export type Profile = {
  id: string;
  name: string;
  avatar: string;
  mode: Mode;
  class: number | null;
  village: string;
  language: string;
  freezes: number;
};

export type LevelInfo = { level: number; xp: number; levelStart: number; nextLevelAt: number; progress: number };
export type DayStatus = 'done' | 'frozen' | 'missed' | 'today';
export type StreakInfo = {
  current: number;
  best: number;
  activeToday: boolean;
  week: { day: string; status: DayStatus }[];
  freezes: number;
};
export type Summary = { profile: Profile; level: LevelInfo; streak: StreakInfo };

export type NodeStatus = 'locked' | 'current' | 'completed';
export type PathChapter = {
  id: string;
  title: string;
  locked: boolean;
  units: { id: string; title: string; icon: string; status: NodeStatus; stars: number }[];
  test: { status: NodeStatus; bestScore: number };
};

export type Unit = {
  id: string;
  chapter_id: string;
  chapter_title: string;
  title: string;
  body: string;
  key_idea: string;
  icon: string;
  class: number;
  subject: string;
};

export type QuizQuestion = { id: string; q: string; options: { text: string; key: number }[] };
export type Quiz = { kind: 'unit' | 'chapter'; refId: string; passPct: number; questions: QuizQuestion[] };

export type Badge = { id: string; title: string; icon: string; desc: string; earned?: boolean };

export type QuizResult = {
  kind: 'unit' | 'chapter';
  refId: string;
  correct: number;
  total: number;
  passed: boolean;
  perfect: boolean;
  passPct: number;
  stars: number;
  results: {
    qid: string;
    q: string;
    options: string[];
    chosenKey: number;
    correctKey: number;
    correct: boolean;
    explanation: string;
  }[];
  xpGained: number;
  breakdown: { label: string; xp: number }[];
  levelBefore: number;
  level: LevelInfo;
  leveledUp: boolean;
  newBadges: Badge[];
  streak: StreakInfo;
  unlocked: string | null;
};

export type Category = 'in_scope' | 'legal' | 'financial' | 'health' | 'mental_health' | 'emergency' | 'off_topic';
