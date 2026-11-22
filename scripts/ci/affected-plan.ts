import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createVitest, parseCLI } from 'vitest/node';

import { readAffectedRange } from './affected-range.ts';
import type { AffectedPlanDocument } from './affected-reporter.ts';
import { selectAffectedTests } from './affected-tests.ts';

export interface AffectedPlanOptions {
  base: string;
  output: string;
  committed: boolean;
  scenarios: boolean;
  run: boolean;
  full: boolean;
  explain: boolean;
  vitestArgs: string[];
}

/** Wrapper flags are separate from native Vitest flags so misspelled scope options cannot widen or omit work silently. */
export const parseAffectedPlanOptions = (args: readonly string[]): AffectedPlanOptions => {
  const result: AffectedPlanOptions = {
    base: 'origin/next',
    output: '.workspace/affected-tests/plan.json',
    committed: false,
    scenarios: false,
    run: false,
    full: false,
    explain: false,
    vitestArgs: [],
  };

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;

    if (argument === '--') {
      result.vitestArgs = args.slice(index + 1);
      break;
    }

    if (argument === '--base' || argument === '--output') {
      const value = args[++index];

      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }

      result[argument === '--base' ? 'base' : 'output'] = value;
    } else if (
      argument === '--committed' ||
      argument === '--scenarios' ||
      argument === '--run' ||
      argument === '--full' ||
      argument === '--explain'
    ) {
      result[argument.slice(2) as 'committed' | 'scenarios' | 'run' | 'full' | 'explain'] = true;
    } else {
      throw new Error(`Unknown affected-test option: ${argument}. Put native Vitest options after --.`);
    }
  }

  if (result.run && result.scenarios) {
    throw new Error('--scenarios is a discovery report; it cannot be combined with --run.');
  }

  return result;
};

/** Stable diagnostic inputs, resolved through the same graph as the actual change. No source file is modified. */
export const AFFECTED_SCENARIOS: Readonly<Record<string, readonly string[]>> = {
  Sprite: ['src/rendering/sprite/Sprite.ts'],
  AnimatedSprite: ['src/rendering/sprite/AnimatedSprite.ts'],
  'WebGL2 Sprite shader': ['src/rendering/webgl2/shaders/sprite.frag'],
  'Shared shader packer': ['packages/exojs-build/src/shaderPlugin.ts'],
  Audio: ['src/audio/Sound.ts'],
  Documentation: ['README.md'],
  'Global Vitest config': ['vitest.config.ts'],
  'Deleted or renamed source': ['src/rendering/sprite/Sprite.ts', 'src/rendering/sprite/__removed_input__.ts'],
  'Sprite and documentation': ['src/rendering/sprite/Sprite.ts', 'README.md'],
};

export const parseAffectedVitestOptions = (args: readonly string[]): ReturnType<typeof parseCLI> => {
  const native = parseCLI(['vitest', 'run', ...args]);
  const allowed = new Set([
    '--',
    'color',
    'run',
    'project',
    'p',
    'root',
    'r',
    'config',
    'c',
    'reporter',
    'outputFile',
    'coverage',
    'fileParallelism',
    'maxWorkers',
    'minWorkers',
    'silent',
    'hideSkippedTests',
    'disableConsoleIntercept',
  ]);
  const unsupported = Object.keys(native.options).filter(option => !allowed.has(option));

  if (native.filter.length > 0 || unsupported.length > 0) {
    throw new Error(
      `The selector owns the complete test-file scope; unsupported Vitest options or filters: ${[...unsupported, ...native.filter].join(
        ', ',
      )}.`,
    );
  }

  if (!native.options.project?.length) {
    throw new Error('Select at least one Vitest --project after --.');
  }

  return native;
};

const main = async (): Promise<void> => {
  const options = parseAffectedPlanOptions(process.argv.slice(2));
  const native = parseAffectedVitestOptions(options.vitestArgs);
  const rangeOptions = { base: options.base, root: resolve(native.options.root ?? process.cwd()), committed: options.committed };
  const range = readAffectedRange(rangeOptions);
  const context = await createVitest({ ...native.options, watch: false, run: true });
  let interrupted = 0;

  const onInterrupt = (): void => {
    interrupted = 130;
    void context.cancelCurrentRun('keyboard-input');
  };

  const onTerminate = (): void => {
    interrupted = 143;
    void context.cancelCurrentRun('keyboard-input');
  };

  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  try {
    if (realpathSync(context.config.root) !== realpathSync(rangeOptions.root)) {
      throw new Error('The Vitest root differs from the pinned checkout. Pass its root explicitly.');
    }

    const forceFull = options.full || context.config.coverage.enabled;
    const selection = await selectAffectedTests(context, forceFull ? [] : range.files);
    selection.fallbackReasons.unshift(...range.fallbackReasons);

    if (forceFull) {
      selection.fallbackReasons.unshift(options.full ? 'Full qualification was requested.' : 'Coverage requires the full test inventory.');
    }

    const selections = [{ name: 'change', ...selection }];

    if (options.scenarios) {
      for (const [name, files] of Object.entries(AFFECTED_SCENARIOS)) {
        selections.push({ name, ...(await selectAffectedTests(context, files)) });
      }
    }

    if (JSON.stringify(readAffectedRange(rangeOptions)) !== JSON.stringify(range)) {
      throw new Error('The checkout or input files changed during dependency discovery. Calculate a fresh selection before running tests.');
    }

    const document: AffectedPlanDocument = { version: 1, base: range.base, head: range.head, tree: range.tree, selections };
    const output = resolve(options.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);

    for (const item of selections) {
      console.log(
        `affected-tests: ${item.name}: ${item.tests.length}/${item.inventory.length} files (${item.mode}, ${Math.round(item.durationMs)} ms)`,
      );

      for (const reason of item.fallbackReasons) {
        console.log(`  full: ${reason}`);
      }

      if (options.explain) {
        for (const test of item.tests) {
          console.log(`  [${test.project}] ${test.file}: ${JSON.stringify(test.reasons)}`);
        }
      }
    }

    console.log(`affected-tests: plan ${relative(process.cwd(), output)}`);

    if (!options.run || interrupted !== 0) {
      return;
    }

    if (selection.mode === 'full') {
      await context.start();
    } else {
      await context.standalone();
      const keys = new Set(selection.tests.map(test => JSON.stringify([test.project, test.file])));
      const inventory = await context.globTestSpecifications();
      const specifications = inventory.filter(specification =>
        keys.has(JSON.stringify([specification.project.name, relative(context.config.root, specification.moduleId).split(sep).join('/')])),
      );

      if (specifications.length !== keys.size) {
        throw new Error('The selected test inventory changed before execution. Run full qualification.');
      }

      const result = await context.runTestSpecifications(specifications, false);

      if (result.unhandledErrors.length > 0 || result.testModules.some(testModule => testModule.state() === 'failed')) {
        process.exitCode = 1;
      }
    }
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    await context.close();

    if (interrupted !== 0) {
      process.exitCode = interrupted;
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
