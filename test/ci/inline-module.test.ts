// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bundleInlineModule, type createInlineModulePlugin } from '@codexo/exojs-config/inline-module';
import { createWorkerPlugin } from '@codexo/exojs-config/worker-plugin';
import { createWorkletPlugin } from '@codexo/exojs-config/worklet-plugin';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * What the worklet and worker plugins have to guarantee about their emitted
 * string, stated as behaviour rather than as a snapshot: the text is executed
 * by `audioWorklet.addModule()` and `new Worker()` in a scope that has no
 * bundler, so a surviving `import` token or a dropped transitive dependency is
 * a runtime failure with no build-time signal.
 *
 * Fixtures are written to a scratch directory instead of living in the tree:
 * they exist to be bundled, and a `.worker.ts`/`.worklet.ts` file inside the
 * repository would be picked up by the type, lint and hygiene programs that
 * police those names.
 */
let fixtureDirectory: string;

/** Loads a module id through a plugin's `resolveId` + `load` pair, as Rollup would. */
type PluginLike = ReturnType<typeof createInlineModulePlugin>;

const loadThroughPlugin = (plugin: PluginLike, importer: string, specifier: string): string => {
  const context = { addWatchFile: () => {} };
  const resolved = (plugin.resolveId as (this: unknown, source: string, importer?: string) => string | null).call(context, specifier, importer);

  expect(resolved, `plugin did not claim ${specifier}`).not.toBeNull();

  const loaded = (plugin.load as (this: unknown, id: string) => string | null).call(context, resolved!);

  expect(loaded, `plugin did not load ${resolved!}`).not.toBeNull();

  return loaded!;
};

/**
 * Runs an emitted bundle against a scratch `globalThis` and returns what it
 * assigned there. The production runtimes evaluate this text as a whole script
 * with no module wrapper, so the only faithful assertion is to do the same;
 * `Function` is the sandboxed form of that (the surrounding module scope is not
 * visible to it).
 */
const runInScope = (source: string): Record<string, unknown> => {
  const scope: Record<string, unknown> = {};

  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the emitted string is the artifact under test; executing it is the assertion
  new Function('globalThis', source).call(undefined, scope);

  return scope;
};

/** Recovers the bundled source string from the `export default "…"` the plugin emits. */
const sourceFromModule = (moduleCode: string): string => {
  const match = /^export default (.*);\n?$/s.exec(moduleCode);

  expect(match, 'plugin output is not a single default-exported string').not.toBeNull();

  return JSON.parse(match![1]!) as string;
};

beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), 'exojs-inline-module-'));
  mkdirSync(join(fixtureDirectory, 'shared'), { recursive: true });

  writeFileSync(
    join(fixtureDirectory, 'shared', 'nested.ts'),
    ['export const NESTED_FACTOR = 3;', 'export const scale = (value: number): number => value * NESTED_FACTOR;', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(fixtureDirectory, 'shared', 'helper.ts'),
    ["import { scale } from './nested';", '', 'export const double = (value: number): number => scale(value) / 1.5;', ''].join('\n'),
    'utf8',
  );
  writeFileSync(join(fixtureDirectory, 'solo.ts'), ['const answer: number = 42;', 'globalThis.__inlineSolo = answer;', ''].join('\n'), 'utf8');
  writeFileSync(
    join(fixtureDirectory, 'entry.ts'),
    ["import { double } from './shared/helper';", '', 'globalThis.__inlineEntry = double(21);', ''].join('\n'),
    'utf8',
  );
  writeFileSync(join(fixtureDirectory, 'broken.ts'), 'export const oops = (: number => 1;\n', 'utf8');
  writeFileSync(join(fixtureDirectory, 'defined.ts'), 'globalThis.__inlineDefined = __INLINE_DEFINE__;\n', 'utf8');
  writeFileSync(
    join(fixtureDirectory, 'sample.worklet.ts'),
    ["import { double } from './shared/helper';", '', 'globalThis.__workletValue = double(4);', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(fixtureDirectory, 'sample.worker.ts'),
    ["import { double } from './shared/helper';", '', 'globalThis.__workerValue = double(6);', ''].join('\n'),
    'utf8',
  );
  writeFileSync(join(fixtureDirectory, 'importer.ts'), '', 'utf8');
});

afterAll(() => {
  rmSync(fixtureDirectory, { recursive: true, force: true });
});

describe('bundleInlineModule', () => {
  it('bundles a single file with no dependencies', () => {
    const { code } = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'solo.ts') });

    expect(code).toContain('42');
  });

  it('inlines an imported local module and its own nested dependency', () => {
    const { code, inputs } = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'entry.ts') });

    // The value only exists if both hops of the chain made it in: entry →
    // helper → nested. Asserting on the numeric result rather than on the
    // identifier survives minification and esbuild's renaming.
    const scope = runInScope(code);

    expect(scope['__inlineEntry']).toBe(42);
    expect(inputs.some(input => input.endsWith('nested.ts'))).toBe(true);
  });

  it('strips TypeScript syntax', () => {
    const { code } = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'entry.ts') });

    expect(code).not.toContain(': number');
  });

  it('emits no import or export token', () => {
    const { code } = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'entry.ts') });

    // The emitted text is evaluated both as a module and as a classic script;
    // either token would be a SyntaxError in the second case.
    expect(/\bimport\b|\bexport\b/.test(code)).toBe(false);
  });

  it('produces readable output with minify off and smaller output with it on', () => {
    const plain = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'entry.ts') }).code;
    const minified = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'entry.ts'), minify: true }).code;

    expect(plain).toContain('\n');
    expect(minified.length).toBeLessThan(plain.length);
  });

  it('is deterministic for the same input', () => {
    const first = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'entry.ts') }).code;
    const second = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'entry.ts') }).code;

    expect(second).toBe(first);
  });

  it('applies compile-time defines', () => {
    const { code } = bundleInlineModule({ entryPoint: join(fixtureDirectory, 'defined.ts'), define: { __INLINE_DEFINE__: '7' } });
    const scope = runInScope(code);

    expect(scope['__inlineDefined']).toBe(7);
  });

  it('surfaces the offending source path when the entry point does not parse', () => {
    expect(() => bundleInlineModule({ entryPoint: join(fixtureDirectory, 'broken.ts') })).toThrow(/broken\.ts/);
  });
});

describe('createWorkletPlugin', () => {
  it('claims only the ?worklet query', () => {
    const plugin = createWorkletPlugin();
    const context = { addWatchFile: () => {} };
    const resolveId = plugin.resolveId as (this: unknown, source: string, importer?: string) => string | null;

    expect(resolveId.call(context, './sample.worklet.ts', join(fixtureDirectory, 'importer.ts'))).toBeNull();
  });

  it('bundles an imported helper into the emitted worklet source', () => {
    const plugin = createWorkletPlugin();
    const source = sourceFromModule(loadThroughPlugin(plugin, join(fixtureDirectory, 'importer.ts'), './sample.worklet.ts?worklet'));
    const scope = runInScope(source);

    expect(scope['__workletValue']).toBe(8);
    expect(/\bimport\b|\bexport\b/.test(source)).toBe(false);
  });

  it('minifies only when asked', () => {
    const plain = sourceFromModule(loadThroughPlugin(createWorkletPlugin(), join(fixtureDirectory, 'importer.ts'), './sample.worklet.ts?worklet'));
    const minified = sourceFromModule(
      loadThroughPlugin(createWorkletPlugin({ minify: true }), join(fixtureDirectory, 'importer.ts'), './sample.worklet.ts?worklet'),
    );

    expect(minified.length).toBeLessThan(plain.length);
  });
});

describe('createWorkerPlugin', () => {
  it('bundles an imported helper into the emitted worker source', () => {
    const plugin = createWorkerPlugin();
    const source = sourceFromModule(loadThroughPlugin(plugin, join(fixtureDirectory, 'importer.ts'), './sample.worker.ts?worker'));
    const scope = runInScope(source);

    expect(scope['__workerValue']).toBe(12);
  });

  it('emits classic-script-compatible source', () => {
    const source = sourceFromModule(loadThroughPlugin(createWorkerPlugin(), join(fixtureDirectory, 'importer.ts'), './sample.worker.ts?worker'));

    // `new Worker(blobUrl)` without `{ type: 'module' }` parses a classic
    // script, where module syntax throws before the first statement runs.
    expect(/\bimport\b|\bexport\b/.test(source)).toBe(false);
  });

  it('minifies only when asked', () => {
    const plain = sourceFromModule(loadThroughPlugin(createWorkerPlugin(), join(fixtureDirectory, 'importer.ts'), './sample.worker.ts?worker'));
    const minified = sourceFromModule(
      loadThroughPlugin(createWorkerPlugin({ minify: true }), join(fixtureDirectory, 'importer.ts'), './sample.worker.ts?worker'),
    );

    expect(minified.length).toBeLessThan(plain.length);
  });
});
