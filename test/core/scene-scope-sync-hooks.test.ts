/**
 * Synchronous-hook contract for `Scene.init` and the frame hooks
 * (`fixedUpdate`/`update`/`draw`), plus the `System` phases dispatched by
 * `SystemRegistry`.
 *
 * Two halves:
 *
 *   1. Behaviour - an `async` override is a hard failure, not a warning: it
 *      throws, names the owner and the hook, and points at `load()`. The
 *      abandoned thenable's rejection is detached so it never surfaces as an
 *      unhandled rejection on top of the lifecycle error. `load()`/`unload()`
 *      stay legitimately asynchronous.
 *
 *   2. Production parity - the guard is never `__DEV__`-gated, so dev and
 *      production behave identically. Vitest always compiles `__DEV__` to
 *      `true`, so production is verified two ways: structurally (no `__DEV__`
 *      anywhere near the guard or inside it) and empirically, by running the
 *      guard module through a Rollup+terser pipeline that models the real
 *      production build's stripping semantics (`@rollup/plugin-replace` with
 *      `__DEV__` set to `false`, then `terser` with a `pure_funcs` list
 *      derived from `src/core/dev.ts`) and executing the minified output.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import { type Plugin, rollup } from 'rollup';
import ts from 'typescript';

import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneScope } from '#core/scene/SceneScope';
import { Signal } from '#core/Signal';
import { SystemRegistry } from '#core/SystemRegistry';
import { Time } from '#core/units';

import { createBuildDefines, resolveVersion } from '../../packages/exojs-config/build-defines/index.js';
import { devGatedPureFuncs } from '../build-defines/dev-pure-funcs';

const rootDir = resolve(import.meta.dirname!, '..', '..');

const readSource = (rel: string): string => readFileSync(resolve(rootDir, rel), 'utf8');

/**
 * Blanks out block and line comments, preserving line structure. The
 * production-parity checks below are about executable code - prose that
 * *mentions* `__DEV__` (this contract's documentation does, at length) must not
 * read as a guard.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, line => ' '.repeat(line.length));

const devToken = /(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/;

/** Parses `rel` into a TypeScript AST with parent pointers, for the structural checks below. */
const parseSource = (rel: string): ts.SourceFile => ts.createSourceFile(rel, readSource(rel), ts.ScriptTarget.ES2022, true);

/** Every call to a `requireSynchronous...` guard. AST-based, so comments and strings never count. */
const guardCallSites = (source: ts.SourceFile): ts.CallExpression[] => {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && /(?:^|\.)_?requireSynchronous\w*$/.test(node.expression.getText(source))) {
      calls.push(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return calls;
};

/**
 * Whether `node` sits inside anything `__DEV__` can switch off - an
 * `if (__DEV__)` branch, a `__DEV__ && ...` short-circuit, or a `__DEV__ ? ...`
 * conditional. A neighbouring `if (__DEV__) Perf.mark(...)` statement is
 * correctly *not* a gate, which is why this walks the AST instead of nearby
 * source lines.
 */
const isDevGated = (node: ts.Node, source: ts.SourceFile): boolean => {
  for (let current: ts.Node = node; current.parent !== undefined; current = current.parent) {
    const parent = current.parent;

    if (
      ts.isIfStatement(parent) &&
      (parent.thenStatement === current || parent.elseStatement === current) &&
      devToken.test(parent.expression.getText(source))
    ) {
      return true;
    }

    if (
      ts.isConditionalExpression(parent) &&
      (parent.whenTrue === current || parent.whenFalse === current) &&
      devToken.test(parent.condition.getText(source))
    ) {
      return true;
    }

    if (ts.isBinaryExpression(parent) && parent.right === current && devToken.test(parent.left.getText(source))) {
      return true;
    }
  }

  return false;
};

/** Minimal Application stand-in covering every touchpoint SceneScope activation reaches. */
const createAppStub = (): Application =>
  ({
    loader: { _releaseScope: vi.fn() },
    interaction: {
      attachRoot: vi.fn(),
      detachRoot: vi.fn(),
      attachUIRoot: vi.fn(),
      detachUIRoot: vi.fn(),
    },
    onError: new Signal<[Error]>(),
  }) as unknown as Application;

/** Prepares and activates `scene`, so the frame hooks actually dispatch. */
const activate = async (scene: Scene): Promise<SceneScope> => {
  const scope = new SceneScope(createAppStub(), scene);

  await scope.prepare(undefined);
  scope.activate();

  return scope;
};

/** Lets any queued microtask-level unhandled rejection surface before the test ends. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('synchronous hook contract', () => {
  describe('Scene.init()', () => {
    test('an async override fails activation, naming the scene, the hook and load()', async () => {
      class AsyncInitScene extends Scene {}

      const scene = Object.assign(new AsyncInitScene(), {
        async init(): Promise<void> {
          /* never awaited by the engine */
        },
      });
      const scope = new SceneScope(createAppStub(), scene);

      await expect(scope.prepare(undefined)).rejects.toThrow(/AsyncInitScene\.init\(\)/);
      await expect(new SceneScope(createAppStub(), scene).prepare(undefined)).rejects.toThrow(/must be synchronous/);
      await expect(new SceneScope(createAppStub(), scene).prepare(undefined)).rejects.toThrow(/load\(\)/);
    });

    test('the abandoned init() rejection is detached, not left unhandled', async () => {
      const scene = Object.assign(new Scene(), {
        init(): unknown {
          return Promise.reject(new Error('rejected inside the abandoned init() promise'));
        },
      });
      const scope = new SceneScope(createAppStub(), scene);

      await expect(scope.prepare(undefined)).rejects.toThrow(/must be synchronous/);
      await flushMicrotasks();
    });

    test('a synchronous init() is unaffected', async () => {
      const scope = new SceneScope(createAppStub(), new Scene());

      await expect(scope.prepare(undefined)).resolves.toBeUndefined();
    });
  });

  describe('Scene frame hooks', () => {
    test('an async fixedUpdate() override throws, naming the scene, the hook and load()', async () => {
      class AsyncFixedScene extends Scene {}

      const scene = Object.assign(new AsyncFixedScene(), {
        async fixedUpdate(): Promise<void> {
          /* never awaited by the engine */
        },
      });
      const scope = await activate(scene);

      expect(() => scope.fixedUpdate(Time.toSeconds(Time.milliseconds(16)))).toThrow(/AsyncFixedScene\.fixedUpdate\(\) returned a Promise/);
      expect(() => scope.fixedUpdate(Time.toSeconds(Time.milliseconds(16)))).toThrow(/must be synchronous/);
      expect(() => scope.fixedUpdate(Time.toSeconds(Time.milliseconds(16)))).toThrow(/load\(\)/);
    });

    test('an async update() override throws, naming the scene and the hook', async () => {
      class AsyncUpdateScene extends Scene {}

      const scene = Object.assign(new AsyncUpdateScene(), {
        async update(): Promise<void> {
          /* never awaited by the engine */
        },
      });
      const scope = await activate(scene);

      expect(() => scope.update(Time.toSeconds(Time.milliseconds(16)))).toThrow(/AsyncUpdateScene\.update\(\) returned a Promise/);
    });

    test('an async draw() override throws, naming the scene and the hook', async () => {
      class AsyncDrawScene extends Scene {}

      const scene = Object.assign(new AsyncDrawScene(), {
        async draw(): Promise<void> {
          /* never awaited by the engine */
        },
      });
      const scope = await activate(scene);

      expect(() => scope.draw({} as never)).toThrow(/AsyncDrawScene\.draw\(\) returned a Promise/);
    });

    test('the abandoned frame-hook rejection is detached, not left unhandled', async () => {
      const scene = Object.assign(new Scene(), {
        update(): unknown {
          return Promise.reject(new Error('rejected inside the abandoned update() promise'));
        },
      });
      const scope = await activate(scene);

      expect(() => scope.update(Time.toSeconds(Time.milliseconds(16)))).toThrow(/must be synchronous/);
      await flushMicrotasks();
    });

    test('synchronous frame hooks still dispatch to the scene and its systems', async () => {
      const fixedUpdate = vi.fn();
      const update = vi.fn();
      const draw = vi.fn();
      const scene = Object.assign(new Scene(), { fixedUpdate, update, draw });
      const scope = await activate(scene);

      const system = { fixedUpdate: vi.fn(), update: vi.fn(), draw: vi.fn() };

      scope.systems.add(system);

      scope.fixedUpdate(Time.toSeconds(Time.milliseconds(16)));
      scope.update(Time.toSeconds(Time.milliseconds(16)));
      scope.draw({} as never);

      expect(fixedUpdate).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(1);
      expect(draw).toHaveBeenCalledTimes(1);
      expect(system.fixedUpdate).toHaveBeenCalledTimes(1);
      expect(system.update).toHaveBeenCalledTimes(1);
      expect(system.draw).toHaveBeenCalledTimes(1);
    });

    test('a hook returning a plain non-thenable value is not a synchrony violation', async () => {
      const scene = Object.assign(new Scene(), {
        update(): unknown {
          return 42;
        },
      });
      const scope = await activate(scene);

      expect(() => scope.update(Time.toSeconds(Time.milliseconds(16)))).not.toThrow();
    });
  });

  describe('System phases', () => {
    test('an async update() phase throws, naming the system and the phase', () => {
      class AsyncSystem {
        public async update(): Promise<void> {
          /* never awaited by the engine */
        }
      }

      const registry = new SystemRegistry();

      registry.add(new AsyncSystem() as never);

      expect(() => registry._update(Time.toSeconds(Time.milliseconds(16)))).toThrow(/AsyncSystem\.update\(\) returned a Promise/);
      expect(() => registry._update(Time.toSeconds(Time.milliseconds(16)))).toThrow(/must be synchronous/);
    });

    test('an async fixedUpdate() phase throws', () => {
      class AsyncFixedSystem {
        public async fixedUpdate(): Promise<void> {
          /* never awaited by the engine */
        }
      }

      const registry = new SystemRegistry();

      registry.add(new AsyncFixedSystem() as never);

      expect(() => registry._fixedUpdate(Time.toSeconds(Time.milliseconds(16)))).toThrow(/AsyncFixedSystem\.fixedUpdate\(\) returned a Promise/);
    });

    test('an async draw() phase throws', () => {
      class AsyncDrawSystem {
        public async draw(): Promise<void> {
          /* never awaited by the engine */
        }
      }

      const registry = new SystemRegistry();

      registry.add(new AsyncDrawSystem() as never);

      expect(() => registry._draw({} as never)).toThrow(/AsyncDrawSystem\.draw\(\) returned a Promise/);
    });

    test('an async phase on a plain object literal falls back to a generic owner label', () => {
      const registry = new SystemRegistry();

      registry.add({
        async update(): Promise<void> {
          /* never awaited by the engine */
        },
      } as never);

      expect(() => registry._update(Time.toSeconds(Time.milliseconds(16)))).toThrow(/System\.update\(\) returned a Promise/);
    });

    test('synchronous system phases are unaffected', () => {
      const registry = new SystemRegistry();
      const system = { update: vi.fn() };

      registry.add(system);

      expect(() => registry._update(Time.toSeconds(Time.milliseconds(16)))).not.toThrow();
      expect(system.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('load()/unload() stay asynchronous', () => {
    test('an async load() override is awaited before init() and never rejected as a synchrony violation', async () => {
      const events: string[] = [];

      class AsyncLoadScene extends Scene {
        public override async load(): Promise<void> {
          events.push('load:start');
          await Promise.resolve();
          events.push('load:end');
        }

        public override init(): void {
          events.push('init');
        }
      }

      const scope = new SceneScope(createAppStub(), new AsyncLoadScene());

      await expect(scope.prepare(undefined)).resolves.toBeUndefined();
      expect(events).toEqual(['load:start', 'load:end', 'init']);
    });

    test('an async unload() override is awaited during teardown', async () => {
      const events: string[] = [];

      class AsyncUnloadScene extends Scene {
        public override async unload(): Promise<void> {
          events.push('unload:start');
          await Promise.resolve();
          events.push('unload:end');
        }
      }

      const scope = await activate(new AsyncUnloadScene());

      await scope.destroy();

      expect(events).toEqual(['unload:start', 'unload:end']);
    });
  });
});

// ---------------------------------------------------------------------------
// Production parity.
// ---------------------------------------------------------------------------

/**
 * Bundles `src/core/syncHooks.ts` through a Rollup+terser pipeline that
 * models the real production build's stripping semantics (`__DEV__` set to
 * `false`, then `terser` with a `pure_funcs` list derived from
 * `src/core/dev.ts`) and returns the minified IIFE. The module imports
 * nothing, so this bundles one small file and stays fast.
 */
const buildProductionSyncHooks = async (pureFuncs: string[]): Promise<string> => {
  const virtualId = '\0virtual-sync-hooks.js';
  const code = ts.transpileModule(readSource('src/core/syncHooks.ts'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const virtualPlugin: Plugin = {
    name: 'virtual-sync-hooks',
    resolveId: id => (id === virtualId ? id : null),
    load: id => (id === virtualId ? code : null),
  };

  // Same define values production uses (mode: 'production' → __DEV__: 'false').
  const defines = createBuildDefines({ mode: 'production', version: resolveVersion(rootDir), revision: 'test' });

  const bundle = await rollup({
    input: virtualId,
    plugins: [virtualPlugin, replace({ preventAssignment: true, values: defines }), terser({ compress: { pure_funcs: pureFuncs } })],
    onwarn: () => {
      // Silence rollup's treeshaking noise for this tiny synthetic entry.
    },
  });

  try {
    const { output } = await bundle.generate({ format: 'iife', name: 'syncHooks' });

    return output[0]!.code;
  } finally {
    await bundle.close();
  }
};

describe('production parity of the synchronous-hook guard', () => {
  test('the guard module has no executable __DEV__ reference, so nothing in it can be stripped', () => {
    expect(stripComments(readSource('src/core/syncHooks.ts'))).not.toMatch(devToken);
  });

  test.each([
    // SceneScope: init() plus the three frame hooks, and the shared cold-path helper.
    { file: 'src/core/scene/SceneScope.ts', minimumCallSites: 5 },
    // SystemRegistry: the three phase loops, and the shared cold-path helper.
    { file: 'src/core/SystemRegistry.ts', minimumCallSites: 4 },
  ])('$file invokes the guard outside every __DEV__ branch', ({ file, minimumCallSites }) => {
    const source = parseSource(file);
    const callSites = guardCallSites(source);

    expect(callSites.length).toBeGreaterThanOrEqual(minimumCallSites);

    for (const call of callSites) {
      const { line } = source.getLineAndCharacterOfPosition(call.getStart(source));

      expect(isDevGated(call, source), `${file}:${line + 1} must not sit inside a __DEV__ branch`).toBe(false);
    }
  });

  test('the __DEV__-gate detector actually detects a gate', () => {
    // Guards the guard: without this, a broken `isDevGated` would silently pass
    // the assertions above no matter how the call sites were written.
    const probe = ts.createSourceFile(
      'probe.ts',
      'if (__DEV__) { requireSynchronousHook(x, y, z); }\nif (__DEV__ && x) requireSynchronousHook(x, y, z);\n',
      ts.ScriptTarget.ES2022,
      true,
    );
    const calls = guardCallSites(probe);

    expect(calls).toHaveLength(2);
    expect(calls.map(call => isDevGated(call, probe))).toEqual([true, true]);
  });

  test('the guard is absent from the derived dev-gated pure-funcs list, so terser never drops its callsites', () => {
    expect(devGatedPureFuncs()).not.toContain('requireSynchronousHook');
  });

  test('still throws after the real production pipeline (__DEV__ → false + terser)', async () => {
    const output = await buildProductionSyncHooks(devGatedPureFuncs());
    const sandbox: { syncHooks?: { requireSynchronousHook: (result: unknown, subject: string, remedy: string) => void } } = {};

    runInNewContext(output, sandbox);

    const guard = sandbox.syncHooks!.requireSynchronousHook;

    expect(typeof guard).toBe('function');

    let message = '';

    try {
      guard(Promise.resolve(), 'ProdScene.update()', 'Move asynchronous work into load().');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('ProdScene.update()');
    expect(message).toContain('must be synchronous');
    expect(message).toContain('Move asynchronous work into load().');

    // A synchronous result stays a no-op in production, exactly as in dev.
    expect(() => guard(undefined, 'ProdScene.update()', 'irrelevant')).not.toThrow();
  }, 20_000);
});
