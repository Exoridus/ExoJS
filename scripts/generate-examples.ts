/**
 * Generates the Git-ignored `examples/**\/*.js` siblings of the example
 * sources. Run it before anything that executes or serves an example directly;
 * the site, `typecheck:examples` and the example tests do so themselves.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateExamples } from './transpile-examples.ts';

const examplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples');

const { sources, written, pruned } = await generateExamples(examplesDir);

console.log(`[examples:generate] ${sources} sources, ${written} written, ${pruned} pruned`);
