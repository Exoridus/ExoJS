/**
 * Phase 0B — Typed Declarative Asset Handlers & Identity
 *
 * Type-level tests: verify that AssetLoadRequest, AssetHandler, and AssetBinding
 * generics behave as specified (options typing, result derivation, satisfies pattern).
 *
 * Runtime tests: verify that a declarative handler's getIdentityKey propagates
 * through the full Extension → AssetBinding → materializeAssetBindings →
 * Loader.bindAsset → identity resolution path.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { AssetBinding, AssetHandler, AssetLoadRequest } from '#extensions/Extension';
import { materializeAssetBindings } from '#extensions/materialize';
import { Asset } from '#resources/Asset';
import type { AssetLoaderContext } from '#resources/Loader';
import { Loader } from '#resources/Loader';

// ---------------------------------------------------------------------------
// Minimal test asset types
// ---------------------------------------------------------------------------

class ExampleAsset {}
class OtherAsset {}

interface ExampleLoadOptions {
  readonly format?: 'example' | 'alt';
  readonly strict?: boolean;
  /** Control-only: does not change the produced resource. */
  readonly trace?: boolean;
}

// ---------------------------------------------------------------------------
// Shared normalization helper (used by both getIdentityKey and load to stay aligned)
// ---------------------------------------------------------------------------

interface ResolvedExampleOptions {
  readonly format: 'example' | 'alt';
  readonly strict: boolean;
}

function resolveExampleOptions(opts: ExampleLoadOptions | undefined): ResolvedExampleOptions {
  return {
    format: opts?.format ?? 'example',
    strict: opts?.strict ?? true,
  };
}

// ---------------------------------------------------------------------------
// Type-level tests
// ---------------------------------------------------------------------------

describe('AssetHandler type contracts', () => {
  it('handler without options: request.options is undefined', () => {
    const handler: AssetHandler<ExampleAsset> = {
      async load(request) {
        expectTypeOf(request.options).toEqualTypeOf<undefined>();
        return new ExampleAsset();
      },
    };

    expectTypeOf(handler).toMatchTypeOf<AssetHandler<ExampleAsset>>();
  });

  it('handler with options: request.options is typed and optional', () => {
    const handler: AssetHandler<ExampleAsset, ExampleLoadOptions> = {
      getIdentityKey(request) {
        expectTypeOf(request.options).toEqualTypeOf<ExampleLoadOptions | undefined>();
        void request.options?.format;
        void request.options?.strict;
        return request.source;
      },

      async load(request) {
        expectTypeOf(request.options).toEqualTypeOf<ExampleLoadOptions | undefined>();
        void request.options?.format;
        void request.options?.strict;
        return new ExampleAsset();
      },
    };

    expectTypeOf(handler).toMatchTypeOf<AssetHandler<ExampleAsset, ExampleLoadOptions>>();
  });

  it('getIdentityKey and load receive the same request type', () => {
    type RequestInGetIdentity = Parameters<NonNullable<AssetHandler<ExampleAsset, ExampleLoadOptions>['getIdentityKey']>>[0];
    type RequestInLoad = Parameters<AssetHandler<ExampleAsset, ExampleLoadOptions>['load']>[0];

    expectTypeOf<RequestInGetIdentity>().toEqualTypeOf<RequestInLoad>();
  });

  it('handler without options cannot access typed option properties', () => {
    const handler: AssetHandler<ExampleAsset> = {
      async load(request) {
        // @ts-expect-error — options is undefined, no .format property
        void request.options?.format;
        return new ExampleAsset();
      },
    };

    void handler;
  });

  it('handler with options rejects unknown option properties', () => {
    const handler: AssetHandler<ExampleAsset, ExampleLoadOptions> = {
      async load(request) {
        // @ts-expect-error — unknownField is not part of ExampleLoadOptions
        void request.options?.unknownField;
        return new ExampleAsset();
      },
    };

    void handler;
  });
});

describe('AssetBinding type contracts', () => {
  it('binding derives result from constructor via satisfies', () => {
    const binding = {
      type: ExampleAsset,
      typeNames: ['example' as const],

      create() {
        return {
          getIdentityKey(request: AssetLoadRequest<ExampleLoadOptions>) {
            const o = resolveExampleOptions(request.options);
            return [request.source, o.format, String(o.strict)].join('|');
          },

          async load(request: AssetLoadRequest<ExampleLoadOptions>) {
            resolveExampleOptions(request.options);
            return new ExampleAsset();
          },
        };
      },
    } satisfies AssetBinding<typeof ExampleAsset, ExampleLoadOptions>;

    expectTypeOf(binding.type).toEqualTypeOf<typeof ExampleAsset>();
  });

  it('binding rejects wrong result type', () => {
    const _binding = {
      type: ExampleAsset,

      create() {
        return {
          // @ts-expect-error — OtherAsset is not assignable to ExampleAsset
          async load(_request: AssetLoadRequest<ExampleLoadOptions>): Promise<OtherAsset> {
            return new OtherAsset();
          },
        };
      },
    } satisfies AssetBinding<typeof ExampleAsset, ExampleLoadOptions>;

    void _binding;
  });

  it('no-options binding: options in handler request is undefined', () => {
    const _binding = {
      type: ExampleAsset,

      create() {
        return {
          async load(request: AssetLoadRequest) {
            expectTypeOf(request.options).toEqualTypeOf<undefined>();
            return new ExampleAsset();
          },
        };
      },
    } satisfies AssetBinding<typeof ExampleAsset>;

    void _binding;
  });

  it('no-options binding: handler cannot access typed option values', () => {
    const _binding = {
      type: ExampleAsset,

      create() {
        return {
          async load(request: AssetLoadRequest) {
            // @ts-expect-error — options is undefined, no .format property
            void request.options?.format;
            return new ExampleAsset();
          },
        };
      },
    } satisfies AssetBinding<typeof ExampleAsset>;

    void _binding;
  });
});

// ---------------------------------------------------------------------------
// Runtime identity tests
// ---------------------------------------------------------------------------

describe('declarative bindAsset identity propagation', () => {
  let loader: Loader;

  beforeEach(() => {
    loader = new Loader();
  });

  function buildExampleBinding(
    onLoad: (opts: ResolvedExampleOptions) => void,
  ): AssetBinding<typeof ExampleAsset, ExampleLoadOptions> {
    return {
      type: ExampleAsset,
      typeNames: ['example'],

      create() {
        return {
          getIdentityKey(request) {
            const o = resolveExampleOptions(request.options);
            return [request.source, o.format, String(o.strict)].join('|');
          },

          async load(request) {
            const o = resolveExampleOptions(request.options);
            onLoad(o);
            return new ExampleAsset();
          },
        };
      },
    };
  }

  it('getIdentityKey is forwarded through bindAsset into the internal HandlerEntry', async () => {
    let loadCount = 0;
    materializeAssetBindings(loader, [buildExampleBinding(() => loadCount++)]);

    // Both assets have identical source + options — same identity → single load
    const a1 = new Asset({ type: 'example', source: 'file.dat', format: 'example', strict: true });
    const a2 = new Asset({ type: 'example', source: 'file.dat', format: 'example', strict: true });

    await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('same request loaded twice returns the same in-flight promise (deduplication)', async () => {
    const calls: ResolvedExampleOptions[] = [];
    materializeAssetBindings(loader, [buildExampleBinding(o => calls.push(o))]);

    const a1 = new Asset({ type: 'example', source: 'world.dat', format: 'example', strict: true });
    const a2 = new Asset({ type: 'example', source: 'world.dat', format: 'example', strict: true });

    const [r1, r2] = await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(calls).toHaveLength(1);
    expect(r1).toBe(r2);
    loader.destroy();
  });

  it('different result-changing options produce separate identities', async () => {
    const calls: boolean[] = [];
    materializeAssetBindings(loader, [buildExampleBinding(o => calls.push(o.strict))]);

    // strict: true and strict: false produce different resources
    const strict = new Asset({ type: 'example', source: 'data.dat', strict: true });
    const lenient = new Asset({ type: 'example', source: 'data.dat', strict: false });

    const [r1, r2] = await Promise.all([loader.load(strict), loader.load(lenient)]);

    expect(calls).toHaveLength(2);
    // Results are separate instances
    expect(r1).not.toBe(r2);
    loader.destroy();
  });

  it('default normalization: omitted options and explicit defaults produce same identity', async () => {
    let loadCount = 0;
    materializeAssetBindings(loader, [buildExampleBinding(() => loadCount++)]);

    // load with no options — handler normalizes to { format: 'example', strict: true }
    const noOpts = new Asset({ type: 'example', source: 'map.dat' });
    // load with explicit defaults — same normalized result
    const explicitDefaults = new Asset({ type: 'example', source: 'map.dat', format: 'example', strict: true });

    await Promise.all([loader.load(noOpts), loader.load(explicitDefaults)]);

    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('control-only option (trace) does not affect identity', async () => {
    let loadCount = 0;

    const bindingWithTrace: AssetBinding<typeof ExampleAsset, ExampleLoadOptions> = {
      type: ExampleAsset,
      typeNames: ['traceExample'],

      create() {
        return {
          getIdentityKey(request) {
            // Intentionally excludes `trace` — it is control-only
            const o = resolveExampleOptions(request.options);
            return [request.source, o.format, String(o.strict)].join('|');
          },

          async load(request) {
            const o = resolveExampleOptions(request.options);
            void o;
            loadCount++;
            return new ExampleAsset();
          },
        };
      },
    };

    materializeAssetBindings(loader, [bindingWithTrace]);

    const withTrace = new Asset({ type: 'traceExample', source: 'asset.dat', trace: true });
    const withoutTrace = new Asset({ type: 'traceExample', source: 'asset.dat', trace: false });

    await Promise.all([loader.load(withTrace), loader.load(withoutTrace)]);

    // Same identity despite differing trace values
    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('handler without getIdentityKey preserves source-based identity', async () => {
    let loadCount = 0;

    const noIdentityBinding: AssetBinding<typeof ExampleAsset> = {
      type: ExampleAsset,
      typeNames: ['simpleExample'],

      create() {
        return {
          async load(_request) {
            loadCount++;
            return new ExampleAsset();
          },
        };
      },
    };

    materializeAssetBindings(loader, [noIdentityBinding]);

    const a1 = new Asset({ type: 'simpleExample', source: 'shared.dat' });
    const a2 = new Asset({ type: 'simpleExample', source: 'shared.dat' });

    await Promise.all([loader.load(a1), loader.load(a2)]);

    // Source-only deduplication — both have same source, so single load
    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('handler lifecycle: destroy() is called on loader.destroy()', async () => {
    let destroyed = false;

    const destroyableBinding: AssetBinding<typeof ExampleAsset> = {
      type: ExampleAsset,
      typeNames: ['destroyable'],

      create() {
        return {
          async load(_request) {
            return new ExampleAsset();
          },
          destroy() {
            destroyed = true;
          },
        };
      },
    };

    materializeAssetBindings(loader, [destroyableBinding]);
    loader.destroy();

    expect(destroyed).toBe(true);
  });

  it('handler receives options nested under request.options via declarative path', async () => {
    let seenRequest: AssetLoadRequest<ExampleLoadOptions> | undefined;

    const capturingBinding: AssetBinding<typeof ExampleAsset, ExampleLoadOptions> = {
      type: ExampleAsset,
      typeNames: ['captureExample'],

      create() {
        return {
          async load(request) {
            seenRequest = request;
            return new ExampleAsset();
          },
        };
      },
    };

    materializeAssetBindings(loader, [capturingBinding]);

    await loader.load(ExampleAsset, 'thing.dat', { format: 'alt', strict: false } as ExampleLoadOptions).catch(() => undefined);

    expect(seenRequest?.source).toBe('thing.dat');
    expect(seenRequest?.options).toEqual({ format: 'alt', strict: false });
    loader.destroy();
  });

  it('handler receives no options key when none are passed (declarative path)', async () => {
    let seenRequest: AssetLoadRequest<ExampleLoadOptions> | undefined;

    const capturingBinding: AssetBinding<typeof ExampleAsset, ExampleLoadOptions> = {
      type: ExampleAsset,
      typeNames: ['captureNoOpts'],

      create() {
        return {
          async load(request) {
            seenRequest = request;
            return new ExampleAsset();
          },
        };
      },
    };

    materializeAssetBindings(loader, [capturingBinding]);

    await loader.load(ExampleAsset, 'thing.dat').catch(() => undefined);

    expect(seenRequest?.source).toBe('thing.dat');
    expect(seenRequest?.options).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(seenRequest, 'options')).toBe(false);
    loader.destroy();
  });
});

// ---------------------------------------------------------------------------
// Module-augmentation test: AssetDefinitions and ExtensionTypeMap are still augmentable
// ---------------------------------------------------------------------------

// Verify that external packages can augment AssetDefinitions without touching core.
// This is a compile-time-only test — no runtime assertions needed.
declare module '#resources/AssetDefinitions' {
  interface AssetDefinitions {
    example: {
      resource: ExampleAsset;
      config: { source: string; format?: 'example' | 'alt'; strict?: boolean };
    };
  }
}

describe('module augmentation', () => {
  it('augmented AssetDefinitions type compiles without error', () => {
    // Type-only validation: AssetLoaderContext is still accessible
    type _CtxCheck = AssetLoaderContext;
    expect(true).toBe(true);
  });
});
