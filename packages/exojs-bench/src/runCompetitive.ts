import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { acquireCompetitiveRun, acquireCompetitiveSession, readCompetitiveSession } from './competitive/acquire';
import { COMPETITIVE_GAPS, COMPETITIVE_SCENARIOS, selectCompetitiveScenarios } from './competitive/catalog';
import { competitiveMatrixOptions, competitivePlan, competitiveProtocolHash, parseCompetitiveOptions } from './competitive/plan';
import { compareCompetitiveSessions, writeCompetitiveReport } from './competitive/report';
import { resolveMatrixCells } from './rendering/driver';

const HELP = `Competitive rendering benchmark, using the existing ExoJS benchmark driver.

pnpm bench:competitive --mode=quick --scenario=B03 --software
pnpm bench:competitive --scenario=B03 --engine=exojs,pixi,phaser --backend=webgl2
pnpm bench:competitive --scenario=B03 --backend=webgpu --profile=gpu
pnpm bench:competitive --mode=deep --scenario=tilemap-edit --load=medium
pnpm bench:competitive --mode=long-run --cycles=20 --engine=exojs
pnpm bench:competitive --report=path/competitive.json --out=path/report
pnpm bench:competitive --report=new/competitive.json --baseline=old/competitive.json --out=path/compare

--scenario  Comma-separated Bxx groups or exact archetype IDs; --list shows coverage.
--mode      quick | standard (default) | deep | long-run.
--profile   timing | gpu | deep; separate acquisitions quantify instrumentation effects.
--load      low | medium (default) | high | all. --nodes explicitly overrides loads.
--runs      Independent fresh-process repetitions; standard defaults to 7.
--frames    Timed frames per cell (default 300, quick 5, long-run 600; maximum 3000).
--warmup-frames  Discarded warmup frames (default 90, quick 2).
--cycles    Scene create/render/destroy cycles in one arm session (long-run only).
--engine    exojs,pixi,phaser. --config selects current,retained,default,culled,webgl2.
--backend   webgl2 (default) | webgpu | webgl2,webgpu.
--machine --driver --power --background  Operator declarations, recorded verbatim.
--platform  Existing harness declaration syntax, for example --platform=11 or --platform=27-beta.
--software --capture  Functional/visual quick-mode checks only; never hardware performance.
--dry-run   Resolve the exact capability-gated matrix without a browser or output.
--out       Fresh acquisition directory; existing results are never overwritten.

All output is diagnostic until hardware identity, equivalence, independent repetitions,
clock resolution and visual evidence are qualified. Missing GPU timing is not estimated.
`;

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const options = parseCompetitiveOptions(argv);

  if (options.help) {
    console.log(HELP);

    return;
  }

  if (options.list) {
    console.log(JSON.stringify({ scenarios: COMPETITIVE_SCENARIOS, gaps: COMPETITIVE_GAPS }, null, 2));

    return;
  }

  if (options.report !== undefined) {
    const current = readCompetitiveSession(options.report);
    writeCompetitiveReport(current, resolve(options.out));

    if (options.baseline !== undefined) {
      const baseline = readCompetitiveSession(options.baseline);
      const comparison = compareCompetitiveSessions(baseline, current);
      writeFileSync(resolve(options.out, 'regression.json'), `${JSON.stringify(comparison, null, 2)}\n`);
      console.log(JSON.stringify(comparison, null, 2));
    }

    console.log(`Diagnostic report written to ${resolve(options.out)}.`);

    return;
  }

  if (options.baseline !== undefined) {
    throw new Error('--baseline requires --report pointing at the current measured session.');
  }

  if (options.dryRun) {
    const cells = resolveMatrixCells(competitiveMatrixOptions(options, 0));
    const unsupported = selectCompetitiveScenarios(options.scenarios).flatMap(scenario =>
      options.engines.flatMap(engine =>
        options.backends
          .filter(
            backend => !cells.some(cell => cell.engine === engine && cell.backend === backend && cell.archetype === scenario.archetype),
          )
          .map(backend => ({ scenario: scenario.id, engine, backend, status: 'UNSUPPORTED_OR_FILTERED' })),
      ),
    );
    console.log(
      JSON.stringify(
        { protocolHash: competitiveProtocolHash(options), options, plan: competitivePlan(options), cells, unsupported },
        null,
        2,
      ),
    );

    return;
  }

  if (options.worker !== undefined) {
    const run = await acquireCompetitiveRun(options, options.worker);

    if (run.error !== null) {
      console.error(run.error);
      process.exitCode = 1;
    }

    return;
  }

  const session = await acquireCompetitiveSession(options, argv);
  writeCompetitiveReport(session, resolve(options.out));
  console.log(`Diagnostic results written to ${resolve(options.out)}. No automatic publication or performance gate.`);

  if (
    session.runs.length !== options.runs ||
    session.runs.some(run => run.error !== null || run.outcome?.results.some(result => result.status !== 'ok'))
  ) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
