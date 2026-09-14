import type { Difficulty, Level } from './types';

export function difficultyForLevel(levelId: number): Difficulty {
  // Courbe montante par vagues : la tendance progresse, avec des respirations
  // régulières pour éviter une escalade mécanique niveau après niveau.
  const trend = Math.min(1, Math.max(0, levelId / 500));
  const wave = Math.sin(levelId / 9) * 0.055 + Math.sin(levelId / 23) * 0.045 + Math.sin(levelId / 51) * 0.035;
  const score = Math.min(1, Math.max(0, trend + wave));
  if (score < 0.16) return 'decouverte';
  if (score < 0.38) return 'rythme';
  if (score < 0.67) return 'maitrise';
  if (score < 0.88) return 'expert';
  return 'sommet';
}

export function difficultyIndex(difficulty: Difficulty): number {
  return ['decouverte', 'rythme', 'maitrise', 'expert', 'sommet'].indexOf(difficulty);
}

export function targetSeconds(level: Pick<Level, 'id' | 'difficulty'>): number {
  const base = { decouverte: 150, rythme: 135, maitrise: 120, expert: 105, sommet: 90 }[level.difficulty];
  return Math.max(55, base - Math.floor(level.id / 60) * 2);
}

export function difficultyLabel(difficulty: Difficulty): string {
  return { decouverte: 'Découverte', rythme: 'Rythme', maitrise: 'Maîtrise', expert: 'Expert', sommet: 'Sommet' }[difficulty];
}
