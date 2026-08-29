import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildPhysicsComparison, buildRenderingComparison } from './comparison/build';
import { renderComparison } from './comparison/render';
import type { PhysicsReportData } from './physics/report';
import type { ReportData } from './rendering/report';
import { parseArgs } from './shared/args';

/**
 * Generate the published cross-library comparison from measured runs.
 *
 * Reads the `results.json` a rendering run and/or a physics run wrote and emits
 * one Markdown document. It never measures anything itself: a comparison
 * assembled in the same process that took the timings could quietly re-run a cell
 * that looked wrong, and the artifact would stop being a function of the
 * recorded data.
 *
 * Usage:
 *
 * ```
 * pnpm --filter @codexo/exojs-bench bench:compare \\
 *   --rendering .workspace/output/baseline/results.json \\
 *   --physics .workspace/output/physics/results.json \\
 *   --out .workspace/output/comparison.md
 * ```
 */

/** Default output path for the generated document. */
const DEFAULT_OUT = '.workspace/output/comparison.md';

/** Read and parse one `results.json`, or exit with a message naming the missing file. */
const readResults = <T>(path: string): T => {
  const resolved = resolve(path);

  if (!existsSync(resolved)) {
    throw new Error(`No results file at '${resolved}'. Run the matrix first, then point this at its results.json.`);
  }

  return JSON.parse(readFileSync(resolved, 'utf8')) as T;
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  const renderingPath = args.get('rendering');
  const physicsPath = args.get('physics');
  const outPath = resolve(args.get('out') ?? DEFAULT_OUT);

  if (renderingPath === undefined && physicsPath === undefined) {
    throw new Error('Nothing to compare: pass --rendering and/or --physics pointing at a run results.json.');
  }

  const rendering =
    renderingPath === undefined
      ? undefined
      : ((): { provenance: ReportData['provenance']; libraries: ReportData['libraries']; backends: ReturnType<typeof buildRenderingComparison> } => {
          const data = readResults<ReportData>(renderingPath);

          return { provenance: data.provenance, libraries: data.libraries, backends: buildRenderingComparison(data.results) };
        })();

  const physics =
    physicsPath === undefined
      ? undefined
      : ((): { provenance: PhysicsReportData['provenance']; libraries: PhysicsReportData['libraries']; section: ReturnType<typeof buildPhysicsComparison> } => {
          const data = readResults<PhysicsReportData>(physicsPath);

          return { provenance: data.provenance, libraries: data.libraries, section: buildPhysicsComparison(data.results) };
        })();

  const document = renderComparison({ ...(rendering !== undefined && { rendering }), ...(physics !== undefined && { physics }) });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, document);

  console.log(`Comparison written to ${outPath}`);
};

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
