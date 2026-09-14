import { LEVELS } from '../src/game/data.ts';
import { validateCorpus, formatCorpusReport } from '../src/game/validator.ts';

const report = validateCorpus(LEVELS);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.log(formatCorpusReport(report));
if (!report.valid) process.exitCode = 1;
