/**
 * Production behaviour of `Logger`'s `once` dedup set.
 *
 * Vitest always compiles `__DEV__` to `true`, so the production severity
 * filter (`!__DEV__ && severity < Error`) is dead code in the normal unit
 * lane and cannot be exercised there. This suite instead runs `logging.ts`
 * through a Rollup+terser pipeline that models the real production build's
 * stripping semantics (`@rollup/plugin-replace` with `__DEV__` set to
 * `false`, then `terser` with a `pure_funcs` list derived from
 * `src/core/dev.ts`) and executes the minified output, the same recipe
 * `scene-scope-sync-hooks.test.ts` uses for its guard.
 *
 * The contract under test: a call that the production filter drops must not
 * consume its `once` key. Otherwise the dedup set grows without bound for
 * dynamic keys in shipped builds - paying memory forever for entries that are
 * never emitted - and a dropped low-severity call silently swallows a later
 * `error()` that shares the key.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import { type Plugin, rollup } from 'rollup';
import ts from 'typescript';

import { createBuildDefines, resolveVersion } from '../../packages/exojs-config/build-defines/index.js';
import { devGatedPureFuncs } from '../build-defines/dev-pure-funcs';

const rootDir = resolve(import.meta.dirname!, '..', '..');

const readSource = (rel: string): string => readFileSync(resolve(rootDir, rel), 'utf8');

/**
 * Bundles `src/core/logging.ts` through the exact production transform chain
 * and returns the minified IIFE. The module imports nothing, so this bundles
 * one small file and stays fast.
 */
const buildProductionLogging = async (pureFuncs: string[]): Promise<string> => {
  const virtualId = '\0virtual-logging.js';
  const code = ts.transpileModule(readSource('src/core/logging.ts'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const virtualPlugin: Plugin = {
    name: 'virtual-logging',
    resolveId: id => (id === virtualId ? id : null),
    load: id => (id === virtualId ? code : null),
  };

  const defines = createBuildDefines({ mode: 'production', version: resolveVersion(rootDir), revision: 'test' });

  const bundle = await rollup({
    input: virtualId,
    plugins: [virtualPlugin, replace({ preventAssignment: true, values: defines }), terser({ compress: { pure_funcs: pureFuncs } })],
    onwarn: () => {
      // Silence rollup's treeshaking noise for this tiny synthetic entry.
    },
  });

  try {
    const { output } = await bundle.generate({ format: 'iife', name: 'logging' });

    return output[0]!.code;
  } finally {
    await bundle.close();
  }
};

interface ProductionLogEntry {
  severity: number;
  message: string;
}

interface ProductionLogger {
  debug(message: string, options?: { once?: string }): void;
  info(message: string, options?: { once?: string }): void;
  warn(message: string, options?: { once?: string }): void;
  error(message: string, options?: { once?: string }): void;
  addSink(sink: (entry: ProductionLogEntry) => void): () => void;
  _seenOnce: Set<string>;
}

interface ProductionLoggingModule {
  Logger: new () => ProductionLogger;
  LogSeverity: { Debug: number; Info: number; Warning: number; Error: number };
}

const loadProductionLogging = async (): Promise<ProductionLoggingModule> => {
  const output = await buildProductionLogging(devGatedPureFuncs());
  const sandbox: { logging?: ProductionLoggingModule; console: Console } = { console };

  runInNewContext(output, sandbox);

  expect(typeof sandbox.logging?.Logger).toBe('function');

  return sandbox.logging!;
};

describe('Logger `once` dedup under the real production pipeline', () => {
  let logging: ProductionLoggingModule;

  beforeAll(async () => {
    logging = await loadProductionLogging();
  });

  test('the production severity filter is genuinely active in the bundled output', () => {
    // Guards the harness: if `__DEV__` were not replaced with `false`, every
    // assertion below would pass for the wrong reason.
    const instance = new logging.Logger();
    const received: ProductionLogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.debug('dropped');
    instance.info('dropped');
    instance.warn('dropped');
    instance.error('kept');

    expect(received.map(entry => entry.message)).toEqual(['kept']);
  });

  test('a filtered-out call does not grow the `once` dedup set', () => {
    const instance = new logging.Logger();

    for (let i = 0; i < 100; i++) {
      instance.warn(`per-frame diagnostic ${i}`, { once: `dynamic-key:${i}` });
    }

    expect(instance._seenOnce.size).toBe(0);
  });

  test('an emitted call still consumes its `once` key', () => {
    const instance = new logging.Logger();
    const received: ProductionLogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.error('first', { once: 'error-key' });
    instance.error('duplicate', { once: 'error-key' });

    expect(received.map(entry => entry.message)).toEqual(['first']);
    expect(instance._seenOnce.size).toBe(1);
  });

  test('a filtered-out call does not swallow a later error sharing the key', () => {
    const instance = new logging.Logger();
    const received: ProductionLogEntry[] = [];
    instance.addSink(entry => received.push(entry));

    instance.warn('stripped in production', { once: 'shared-key' });
    instance.error('must still reach the sink', { once: 'shared-key' });

    expect(received.map(entry => entry.message)).toEqual(['must still reach the sink']);
  });
});
