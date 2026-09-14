import type { LevelResult, PlayerSave } from './types';
import type { RewardBreakdown } from './economy';

export const SAVE_KEY = 'mots-en-cascade-save-v2';
export const V1_SAVE_KEY = 'mots-en-cascade-save-v1';
export const LEGACY_SAVE_KEYS = [V1_SAVE_KEY, 'mots-en-cascade-save', 'mots-en-cascade-progress', 'mots-en-cascade-game-state'];

export function defaultSave(): PlayerSave {
  return {
    schemaVersion: 2, currentLevel: 1, coins: 120, xp: 0, streak: 0, bestStreak: 0,
    lastDailyClaim: null, completedLevels: [], results: {}, unlockedAchievements: [],
    inventory: { pair: 1, label: 1, solve: 0 },
    settings: { sound: true, haptics: true, reducedMotion: false }, migratedFromV1: false,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

function coerceResult(value: unknown, levelId: number): LevelResult | undefined {
  if (!isObject(value)) return undefined;
  const bestTime = Number(value.bestTimeSeconds);
  const bestErrors = Number(value.bestErrors);
  const bestHints = Number(value.bestHints);
  const completions = Number(value.completions);
  if (![bestTime, bestErrors, bestHints, completions].every(Number.isFinite)) return undefined;
  return { levelId, bestTimeSeconds: Math.max(0, bestTime), bestErrors: Math.max(0, bestErrors), bestHints: Math.max(0, bestHints), completions: Math.max(1, completions), lastPlayedAt: String(value.lastPlayedAt ?? new Date(0).toISOString()) };
}

function coerceSave(value: unknown): PlayerSave | undefined {
  if (!isObject(value)) return undefined;
  const base = defaultSave();
  const results: Record<string, LevelResult> = {};
  if (isObject(value.results)) Object.entries(value.results).forEach(([key, result]) => { const id = Number(key); const parsed = coerceResult(result, id); if (parsed) results[String(id)] = parsed; });
  const completed = Array.isArray(value.completedLevels) ? value.completedLevels.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id <= 500) : [];
  const inventory = isObject(value.inventory) ? {
    pair: Math.max(0, Number(value.inventory.pair) || 0), label: Math.max(0, Number(value.inventory.label) || 0), solve: Math.max(0, Number(value.inventory.solve) || 0),
  } : base.inventory;
  const settings = isObject(value.settings) ? {
    sound: value.settings.sound !== false, haptics: value.settings.haptics !== false, reducedMotion: value.settings.reducedMotion === true,
  } : base.settings;
  return {
    ...base, schemaVersion: 2, currentLevel: Math.min(500, Math.max(1, Number(value.currentLevel) || 1)), coins: Math.max(0, Number(value.coins) || 0), xp: Math.max(0, Number(value.xp) || 0),
    streak: Math.max(0, Number(value.streak) || 0), bestStreak: Math.max(0, Number(value.bestStreak) || 0), lastDailyClaim: typeof value.lastDailyClaim === 'string' ? value.lastDailyClaim : null,
    completedLevels: [...new Set(completed)].sort((a, b) => a - b), results, unlockedAchievements: Array.isArray(value.unlockedAchievements) ? value.unlockedAchievements.map(String) : [], inventory, settings,
    migratedFromV1: value.migratedFromV1 === true,
  };
}

export function migrateV1(raw: unknown): PlayerSave {
  const save = defaultSave();
  if (!isObject(raw)) return { ...save, migratedFromV1: true };
  const source = isObject(raw.data) ? raw.data : raw;
  const completedRaw = source.completedLevels ?? source.completed ?? source.levelsCompleted;
  const completed = Array.isArray(completedRaw) ? completedRaw.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id <= 500) : [];
  const current = Number(source.currentLevel ?? source.level ?? source.progress ?? 1) || 1;
  const results = isObject(source.results) ? source.results : {};
  const migrated = coerceSave({ ...source, currentLevel: current, coins: source.coins ?? source.gold ?? source.points ?? 0, xp: source.xp ?? source.score ?? 0, completedLevels: completed, results, migratedFromV1: true });
  if (!migrated) return { ...save, migratedFromV1: true };
  migrated.migratedFromV1 = true;
  if (migrated.currentLevel <= 150 && migrated.completedLevels.filter((id) => id <= 150).length >= 150) migrated.currentLevel = 151;
  return migrated;
}

export function loadSave(storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): PlayerSave {
  if (!storage) return defaultSave();
  try {
    const rawV2 = storage.getItem(SAVE_KEY);
    const parsed = rawV2 ? coerceSave(JSON.parse(rawV2)) : undefined;
    if (parsed) return parsed;
    for (const key of LEGACY_SAVE_KEYS) {
      const rawV1 = storage.getItem(key);
      if (rawV1) { const migrated = migrateV1(JSON.parse(rawV1)); storage.setItem(SAVE_KEY, JSON.stringify(migrated)); return migrated; }
    }
  } catch { /* corrupted storage: start with a safe save */ }
  return defaultSave();
}

export function saveSave(save: PlayerSave, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): void {
  if (!storage) return;
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private browsing or quota: keep the current session playable */ }
}

export function claimReward(save: PlayerSave, levelId: number, reward: RewardBreakdown, elapsedSeconds: number, errors: number, hintsUsed: number, improvedRecord = false): PlayerSave {
  const key = String(levelId);
  const previous = save.results[key];
  const excellent = errors <= 1 && hintsUsed === 0;
  const nextStreak = !excellent ? 0 : ((!previous || improvedRecord) ? save.streak + 1 : save.streak);
  const result: LevelResult = previous ? {
    ...previous, bestTimeSeconds: Math.min(previous.bestTimeSeconds, elapsedSeconds), bestErrors: Math.min(previous.bestErrors, errors), bestHints: Math.min(previous.bestHints, hintsUsed), completions: previous.completions + 1, lastPlayedAt: new Date().toISOString(),
  } : { levelId, bestTimeSeconds: elapsedSeconds, bestErrors: errors, bestHints: hintsUsed, completions: 1, lastPlayedAt: new Date().toISOString() };
  const completedLevels = save.completedLevels.includes(levelId) ? save.completedLevels : [...save.completedLevels, levelId].sort((a, b) => a - b);
  return { ...save, currentLevel: Math.max(save.currentLevel, Math.min(500, levelId + 1)), coins: save.coins + reward.total, xp: save.xp + reward.total, completedLevels, results: { ...save.results, [key]: result }, streak: nextStreak, bestStreak: Math.max(save.bestStreak, nextStreak), migratedFromV1: save.migratedFromV1 || false };
}
