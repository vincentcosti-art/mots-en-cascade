import type { Family, Level } from './types';

export interface RoundState {
  levelId: number;
  selected: string[];
  solvedFamilyIds: string[];
  errors: number;
  hintsUsed: number;
  startedAt: number;
  finishedAt?: number;
}

export interface SelectionResult {
  state: RoundState;
  completed: boolean;
  correct: boolean;
  family?: Family;
  selected: string[];
}

export function normalizeWord(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function createRound(level: Level, now = Date.now()): RoundState {
  return { levelId: level.id, selected: [], solvedFamilyIds: [], errors: 0, hintsUsed: 0, startedAt: now };
}

function matchingFamily(level: Level, selected: string[]): Family | undefined {
  const normalized = new Set(selected.map(normalizeWord));
  if (normalized.size !== 4) return undefined;
  return level.families.find((family) => {
    if (family.words.length !== 4) return false;
    return family.words.every((word) => normalized.has(normalizeWord(word))) &&
      family.words.length === selected.length;
  });
}

export function selectionIsFamily(level: Level, selected: string[]): Family | undefined {
  return matchingFamily(level, selected);
}

export function selectWord(level: Level, state: RoundState, word: string, now = Date.now()): SelectionResult {
  if (state.finishedAt || state.solvedFamilyIds.length === level.families.length) {
    return { state, completed: true, correct: true, selected: state.selected };
  }
  const key = normalizeWord(word);
  const alreadySolved = level.families.some((family) => state.solvedFamilyIds.includes(family.id) && family.words.some((item) => normalizeWord(item) === key));
  if (alreadySolved) return { state, completed: false, correct: false, selected: state.selected };
  const current = state.selected.includes(word) ? state.selected.filter((item) => item !== word) : [...state.selected, word];
  if (current.length < 4) {
    const next = { ...state, selected: current };
    return { state: next, completed: false, correct: false, selected: current };
  }

  const family = matchingFamily(level, current);
  if (!family || state.solvedFamilyIds.includes(family.id)) {
    const next = { ...state, selected: [], errors: state.errors + 1 };
    return { state: next, completed: false, correct: false, selected: current };
  }
  const solvedFamilyIds = [...state.solvedFamilyIds, family.id];
  const completed = solvedFamilyIds.length === level.families.length;
  const next: RoundState = {
    ...state,
    selected: [],
    solvedFamilyIds,
    finishedAt: completed ? now : undefined,
  };
  return { state: next, completed, correct: true, family, selected: current };
}

export function isLevelComplete(level: Level, state: RoundState): boolean {
  return state.solvedFamilyIds.length === level.families.length;
}

export function elapsedSeconds(state: RoundState, now = Date.now()): number {
  const end = state.finishedAt ?? now;
  return Math.max(0, Math.floor((end - state.startedAt) / 1000));
}
