import { describe, expect, it } from 'vitest';
import { LEVELS } from './data';
import { calculateReward } from './economy';
import { createRound, selectWord, selectionIsFamily } from './engine';
import { migrateV1, defaultSave, claimReward } from './storage';
import { validateCorpus } from './validator';

describe('corpus V2', () => {
  it('contains 500 playable levels with six families of four words', () => {
    expect(LEVELS).toHaveLength(500);
    for (const level of LEVELS) {
      expect(level.families).toHaveLength(6);
      expect(level.words).toHaveLength(24);
      expect(new Set(level.words.map((word) => word.toLocaleLowerCase('fr-FR'))).size).toBe(24);
      expect(level.families.every((family) => family.words.length === 4)).toBe(true);
    }
  });

  it('passes the corpus validator', () => {
    const report = validateCorpus(LEVELS);
    expect(report.valid).toBe(true);
    expect(report.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });

  it('raises the broad challenge while keeping wave variation', () => {
    const rank = { decouverte: 0, rythme: 1, maitrise: 2, expert: 3, sommet: 4 } as const;
    expect(rank[LEVELS[99].difficulty]).toBeGreaterThanOrEqual(rank[LEVELS[19].difficulty]);
    expect(rank[LEVELS[299].difficulty]).toBeGreaterThanOrEqual(rank[LEVELS[99].difficulty]);
    expect(new Set(LEVELS.slice(0, 80).map((level) => level.difficulty)).size).toBeGreaterThan(1);
  });
});

describe('round engine', () => {
  it('automatically validates a family on the fourth selected word', () => {
    const level = LEVELS[0];
    let round = createRound(level, 0);
    level.families[0].words.forEach((word, index) => { round = selectWord(level, round, word, index * 1000).state; });
    expect(round.solvedFamilyIds).toContain(level.families[0].id);
    expect(round.errors).toBe(0);
    expect(selectionIsFamily(level, level.families[1].words)?.id).toBe(level.families[1].id);
  });

  it('clears a wrong four-word combination and records an error', () => {
    const level = LEVELS[0];
    let round = createRound(level);
    const words = [...level.families[0].words.slice(0, 3), level.families[1].words[0]];
    words.forEach((word) => { round = selectWord(level, round, word).state; });
    expect(round.selected).toHaveLength(0);
    expect(round.errors).toBe(1);
  });
});

describe('economy and migration', () => {
  it('gives non-negative, progressive rewards', () => {
    const easy = calculateReward({ levelId: 1, difficulty: 'decouverte', elapsedSeconds: 60, errors: 0, hintsUsed: 0, streak: 0, firstCompletion: true, improvedRecord: false });
    const hard = calculateReward({ levelId: 400, difficulty: 'expert', elapsedSeconds: 40, errors: 0, hintsUsed: 0, streak: 7, firstCompletion: true, improvedRecord: false });
    expect(easy.total).toBeGreaterThan(0);
    expect(hard.total).toBeGreaterThan(easy.total);
  });

  it('keeps V1 progress and moves a completed V1 journey to level 151', () => {
    const migrated = migrateV1({ currentLevel: 150, coins: 88, score: 34, completed: Array.from({ length: 150 }, (_, index) => index + 1) });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.currentLevel).toBe(151);
    expect(migrated.coins).toBe(88);
    expect(migrated.xp).toBe(34);
    expect(migrated.completedLevels).toHaveLength(150);
  });

  it('is idempotent for completed level membership', () => {
    const reward = calculateReward({ levelId: 1, difficulty: 'decouverte', elapsedSeconds: 90, errors: 1, hintsUsed: 0, streak: 0, firstCompletion: true, improvedRecord: false });
    const first = claimReward(defaultSave(), 1, reward, 90, 1, 0);
    const second = claimReward(first, 1, reward, 80, 0, 0);
    expect(second.completedLevels).toEqual([1]);
    expect(second.results['1'].completions).toBe(2);
  });

  it('does not pay the main reward repeatedly on a replay without a record', () => {
    const replay = calculateReward({ levelId: 1, difficulty: 'decouverte', elapsedSeconds: 200, errors: 3, hintsUsed: 1, streak: 0, firstCompletion: false, improvedRecord: false });
    expect(replay.total).toBe(0);
  });
});
