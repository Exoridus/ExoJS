import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { aggregatePhysicsRuns, aggregateRenderingRuns } from './comparison/aggregate';
import { renderComparison } from './comparison/render';
import type { PhysicsReportData } from './physics/report';
import { buildProfileDocument, writeProfileDocument } from './profile/document';
import type { ReportData } from './rendering/report';
import { parseArgList, parseArgs } from './shared/args';

/**
 * Generate the published cross-library comparison from measured runs.
 *
 * Reads the `results.json` files a rendering measurement and/or a physics
 * measurement wrote and emits one Markdown document. It never measures anything
 * itself: a comparison assembled in the same process that took the timings could
 * quietly re-run a cell that looked wrong, and the artifact would stop being a
 * function of the recorded data.
 *
 * Usage: point `--rendering` and/or `--physics` at the `results.json` a run
 * wrote, and `--out` at the document to write. Both inputs default to nothing -
 * a document must never imply it covers a domain that was not measured - and
 * `--out` defaults to the harness's own (gitignored) output directory.
 *
 * **Both input flags are repeatable, once per run.** A published claim is a
 * ratio between two arms, and one run does not support one: the same code
 * measured twice on one idle machine moves a cell's median far enough to change
 * which arm it favours. Repeating the flag pools the runs - the published value
 * is the median of the per-run medians, each number carries the range the runs
 * observed, and a cell whose runs disagreed on the verdict publishes none.
 *
 * The runs must come from SEPARATE invocations of the harness, each with its own
 * `--out` directory. Repeating a matrix inside one process shares JIT and heap
 * state across the repetitions, so it measures the same warm state several times
 * instead of the measurement's actual spread. Nothing here can check that.
 *
 * ```sh
 * bench:compare \
 *   --rendering run-1/results.json --rendering run-2/results.json --rendering run-3/results.json \
 *   --physics   run-1/results.json --physics   run-2/results.json --physics   run-3/results.json \
 *   --profile
 * ```
 *
 * `--profile` additionally writes the comparison as a signed machine-profile
 * JSON into the committed `results/` directory, named after the machine the
 * provenance describes, which is what the published benchmark pages are
 * generated from. Passing a path instead of a bare flag writes it elsewhere.
 * The Markdown output is unaffected either way.
 */

/** Default output path for the generated document. */
const DEFAULT_OUT = '.workspace/output/comparison.md';

/** Committed profile directory: one file per machine, overwritten by a re-measurement of that machine. */
const RESULTS_DIR = resolve(import.meta.dirname, '../results');

/** Read and parse one `results.json`, or exit with a message naming the missing file. */
const readResults = <T>(path: string): T => {
  const resolved = resolve(path);

  if (!existsSync(resolved)) {
    throw new Error(`No results file at '${resolved}'. Run the matrix first, then point this at its results.json.`);
  }

  return JSON.parse(readFileSync(resolved, 'utf8')) as T;
};

const main = (): void => {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const renderingPaths = parseArgList(argv, 'rendering');
  const physicsPaths = parseArgList(argv, 'physics');
  const outPath = resolve(args.get('out') ?? DEFAULT_OUT);

  if (renderingPaths.length === 0 && physicsPaths.length === 0) {
    throw new Error('Nothing to compare: pass --rendering and/or --physics pointing at a run results.json. Repeat either flag once per run.');
  }

  const rendering = renderingPaths.length === 0 ? undefined : aggregateRenderingRuns(renderingPaths.map(path => readResults<ReportData>(path)));
  const physics = physicsPaths.length === 0 ? undefined : aggregatePhysicsRuns(physicsPaths.map(path => readResults<PhysicsReportData>(path)));
  const document = renderComparison({ ...(rendering !== undefined && { rendering }), ...(physics !== undefined && { physics }) });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, document);

  console.log(`Comparison written to ${outPath}`);

  const profile = args.get('profile');

  if (profile !== undefined) {
    const written = writeProfileDocument(
      buildProfileDocument({ ...(rendering !== undefined && { rendering }), ...(physics !== undefined && { physics }) }),
      profile === 'true' ? RESULTS_DIR : resolve(profile),
    );

    console.log(`Profile written to ${written}`);
  }
};

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
