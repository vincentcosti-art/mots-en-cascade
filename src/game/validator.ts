import type { CorpusReport, Difficulty, Level, ValidationIssue } from './types';
import { normalizeWord } from './engine';

const DIFFICULTIES: Difficulty[] = ['decouverte', 'rythme', 'maitrise', 'expert', 'sommet'];

export function validateCorpus(levels: Level[]): CorpusReport {
  const issues: ValidationIssue[] = [];
  const words = new Set<string>();
  const families = new Set<string>();
  const familyFrequency: Record<string, number> = {};
  const wordFrequency: Record<string, number> = {};
  const familyLastSeen: Record<string, number> = {};
  const wordLastSeen: Record<string, number> = {};
  let minFamilyDistance = Number.POSITIVE_INFINITY;
  let minWordDistance = Number.POSITIVE_INFINITY;
  const levelFingerprints = new Set<string>();
  let identicalLevelCount = 0;
  const distribution: Record<Difficulty, number> = { decouverte: 0, rythme: 0, maitrise: 0, expert: 0, sommet: 0 };
  levels.forEach((level, index) => {
    if (!Number.isInteger(level.id) || level.id !== index + 1) issues.push({ levelId: level.id, code: 'LEVEL_SEQUENCE', message: 'Les identifiants de niveaux doivent être séquentiels.', severity: 'error' });
    if (level.families.length !== 6) issues.push({ levelId: level.id, code: 'FAMILY_COUNT', message: 'Un niveau doit contenir exactement six familles.', severity: 'error' });
    if (level.words.length !== 24) issues.push({ levelId: level.id, code: 'WORD_COUNT', message: 'Un niveau doit contenir exactement vingt-quatre mots.', severity: 'error' });
    if (!DIFFICULTIES.includes(level.difficulty)) issues.push({ levelId: level.id, code: 'DIFFICULTY', message: 'Difficulté inconnue.', severity: 'error' }); else distribution[level.difficulty] += 1;
    const levelWords = new Set<string>();
    const levelFamilies = new Set<string>();
    level.families.forEach((family) => {
      if (!family.label.trim() || family.words.length !== 4 || family.words.some((word) => !word.trim())) issues.push({ levelId: level.id, code: 'FAMILY_SHAPE', message: `Famille invalide : ${family.label || '(sans nom)'}.`, severity: 'error' });
      const familyKey = normalizeWord(family.label);
      if (levelFamilies.has(familyKey)) issues.push({ levelId: level.id, code: 'DUPLICATE_FAMILY', message: `Famille répétée : ${family.label}.`, severity: 'error' });
      levelFamilies.add(familyKey); families.add(familyKey); familyFrequency[familyKey] = (familyFrequency[familyKey] ?? 0) + 1;
      if (familyLastSeen[familyKey] !== undefined) minFamilyDistance = Math.min(minFamilyDistance, level.id - familyLastSeen[familyKey]);
      familyLastSeen[familyKey] = level.id;
      family.words.forEach((word) => { const key = normalizeWord(word); if (levelWords.has(key)) issues.push({ levelId: level.id, code: 'DUPLICATE_WORD', message: `Mot répété dans le niveau : ${word}.`, severity: 'error' }); levelWords.add(key); words.add(key); wordFrequency[key] = (wordFrequency[key] ?? 0) + 1; if (wordLastSeen[key] !== undefined) minWordDistance = Math.min(minWordDistance, level.id - wordLastSeen[key]); wordLastSeen[key] = level.id; });
    });
    const flattened = level.families.flatMap((family) => family.words.map(normalizeWord));
    if (new Set(flattened).size !== 24) issues.push({ levelId: level.id, code: 'FLAT_WORD_COUNT', message: 'Les mots d’un niveau doivent être uniques.', severity: 'error' });
    const fingerprint = level.families.map((family) => `${normalizeWord(family.label)}:${family.words.map(normalizeWord).sort().join(',')}`).sort().join('|');
    if (levelFingerprints.has(fingerprint)) { identicalLevelCount += 1; issues.push({ levelId: level.id, code: 'IDENTICAL_LEVEL', message: 'Niveau strictement identique à un niveau précédent.', severity: 'error' }); }
    levelFingerprints.add(fingerprint);
    if (level.id > 1 && level.id % 50 === 0) {
      const previous = levels.slice(Math.max(0, level.id - 20), level.id - 1).flatMap((item) => item.families.map((family) => normalizeWord(family.label)));
      if (levelFamilies.size && previous.includes([...levelFamilies][0])) issues.push({ levelId: level.id, code: 'FAMILY_COOLDOWN', message: 'Une famille revient trop tôt dans la rotation.', severity: 'warning' });
    }
  });
  if (levels.length !== 500) issues.push({ code: 'LEVEL_TOTAL', message: 'Le corpus doit contenir exactement 500 niveaux.', severity: 'error' });
  const expected = Math.max(1, Math.floor(levels.length / DIFFICULTIES.length));
  DIFFICULTIES.forEach((difficulty) => { if (distribution[difficulty] === 0) issues.push({ code: 'DIFFICULTY_COVERAGE', message: `Aucun niveau ${difficulty}.`, severity: 'error' }); else if (Math.abs(distribution[difficulty] - expected) > expected * 2) issues.push({ code: 'DIFFICULTY_BALANCE', message: `Répartition ${difficulty} atypique.`, severity: 'warning' }); });
  return { levelCount: levels.length, familyCount: families.size, wordsPerLevel: levels.length ? Math.round(levels.reduce((sum, level) => sum + level.words.length, 0) / levels.length) : 0, uniqueWords: words.size, uniqueFamilies: families.size, difficultyDistribution: distribution, familyFrequency, wordFrequency, minFamilyDistance: Number.isFinite(minFamilyDistance) ? minFamilyDistance : 0, minWordDistance: Number.isFinite(minWordDistance) ? minWordDistance : 0, identicalLevelCount, issues, valid: issues.every((issue) => issue.severity !== 'error') };
}

export function formatCorpusReport(report: CorpusReport): string {
  const status = report.valid ? 'PASS' : 'FAIL';
  const topFamilies = Object.entries(report.familyFrequency).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name} (${count})`).join(', ');
  const topWords = Object.entries(report.wordFrequency).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name} (${count})`).join(', ');
  const lines = [`Corpus V2 : ${status}`, `Niveaux : ${report.levelCount}/500`, `Familles uniques : ${report.uniqueFamilies}`, `Mots uniques : ${report.uniqueWords}`, `Moyenne de mots/niveau : ${report.wordsPerLevel}`, `Difficultés : ${JSON.stringify(report.difficultyDistribution)}`, `Distance minimale famille : ${report.minFamilyDistance} niveau(x)`, `Distance minimale mot : ${report.minWordDistance} niveau(x)`, `Niveaux identiques : ${report.identicalLevelCount}`, `Familles les plus fréquentes : ${topFamilies}`, `Mots les plus fréquents : ${topWords}`, `Problèmes : ${report.issues.length}`];
  report.issues.slice(0, 20).forEach((issue) => lines.push(`[${issue.severity.toUpperCase()}] ${issue.levelId ? `Niveau ${issue.levelId} — ` : ''}${issue.code}: ${issue.message}`));
  return lines.join('\n');
}
