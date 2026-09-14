export type Difficulty = 'decouverte' | 'rythme' | 'maitrise' | 'expert' | 'sommet';

export interface Family {
  id: string;
  label: string;
  groupKey: string;
  words: string[];
}

export interface Level {
  id: number;
  chapter: number;
  difficulty: Difficulty;
  families: Family[];
  words: string[];
}

export interface LevelResult {
  levelId: number;
  bestTimeSeconds: number;
  bestErrors: number;
  bestHints: number;
  completions: number;
  lastPlayedAt: string;
}

export interface PlayerSave {
  schemaVersion: 2;
  currentLevel: number;
  coins: number;
  xp: number;
  streak: number;
  bestStreak: number;
  lastDailyClaim: string | null;
  completedLevels: number[];
  results: Record<string, LevelResult>;
  unlockedAchievements: string[];
  inventory: { pair: number; label: number; solve: number };
  settings: { sound: boolean; haptics: boolean; reducedMotion: boolean };
  migratedFromV1: boolean;
}

export interface ValidationIssue {
  levelId?: number;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface CorpusReport {
  levelCount: number;
  familyCount: number;
  wordsPerLevel: number;
  uniqueWords: number;
  uniqueFamilies: number;
  difficultyDistribution: Record<Difficulty, number>;
  familyFrequency: Record<string, number>;
  wordFrequency: Record<string, number>;
  minFamilyDistance: number;
  minWordDistance: number;
  identicalLevelCount: number;
  issues: ValidationIssue[];
  valid: boolean;
}
