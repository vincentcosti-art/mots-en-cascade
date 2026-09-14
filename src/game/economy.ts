import type { Difficulty } from './types';
import { targetSeconds } from './difficulty';

export const HINT_COSTS = { pair: 40, label: 55, solve: 95 } as const;
export type HintKind = keyof typeof HINT_COSTS;

export interface RewardInput {
  levelId: number;
  difficulty: Difficulty;
  elapsedSeconds: number;
  errors: number;
  hintsUsed: number;
  streak: number;
  firstCompletion: boolean;
  improvedRecord: boolean;
}

export interface RewardBreakdown {
  base: number;
  difficulty: number;
  precision: number;
  speed: number;
  perfect: number;
  streak: number;
  milestone: number;
  improvement: number;
  total: number;
}

export function calculateReward(input: RewardInput): RewardBreakdown {
  const difficultyPoints = { decouverte: 3, rythme: 5, maitrise: 7, expert: 9, sommet: 11 }[input.difficulty];
  const precision = input.errors === 0 ? 6 : input.errors === 1 ? 4 : input.errors === 2 ? 2 : 0;
  const target = targetSeconds({ id: input.levelId, difficulty: input.difficulty });
  const speed = input.elapsedSeconds <= target * 0.5 ? 5 : input.elapsedSeconds <= target ? 3 : input.elapsedSeconds <= target * 1.5 ? 1 : 0;
  const perfect = input.errors === 0 && input.hintsUsed === 0 ? 5 : 0;
  const streak = Math.min(7, Math.max(0, input.streak));
  const milestone = input.firstCompletion && input.levelId % 10 === 0 ? 22 + Math.floor(input.levelId / 100) * 4 : 0;
  const improvement = !input.firstCompletion && input.improvedRecord ? 4 : 0;
  const firstRunTotal = Math.max(1, 9 + difficultyPoints + precision + speed + perfect + streak + milestone - input.hintsUsed * 2);
  // Un replay ne distribue pas à nouveau la récompense principale : seul un
  // vrai record amélioré ouvre un petit bonus, ce qui évite le farming.
  const total = input.firstCompletion ? firstRunTotal : (input.improvedRecord ? Math.max(1, improvement + 2) : 0);
  return { base: 9, difficulty: difficultyPoints, precision, speed, perfect, streak, milestone, improvement, total };
}

export function canAfford(coins: number, hint: HintKind): boolean {
  return coins >= HINT_COSTS[hint];
}

export function spendCoins(coins: number, hint: HintKind): number {
  return canAfford(coins, hint) ? coins - HINT_COSTS[hint] : coins;
}
