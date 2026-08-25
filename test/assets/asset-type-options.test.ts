/**
 * The typed-options contract of an asset type: what a factory and the identity
 * hooks see, and how the options a request carries reach the resource identity.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { Asset } from '#assets/Asset';
import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { type AssetRequest, AssetType } from '#assets/AssetType';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

// ---------------------------------------------------------------------------
// Minimal test asset types
// ---------------------------------------------------------------------------

// Distinct members on purpose. As empty classes these two were structurally
// identical, so TypeScript accepted either wherever the other was expected and
// the `@ts-expect-error` assertions below could never fire.
class ExampleAsset {
  readonly kind = 'example';
}
class OtherAsset {
  readonly kind = 'other';
}

interface ExampleLoadOptions {
  readonly format?: 'example' | 'alt';
  readonly strict?: boolean;
  /** Control-only: does not change the produced resource. */
  readonly trace?: boolean;
}

interface ResolvedExampleOptions {
  readonly format: 'example' | 'alt';
  readonly strict: boolean;
}

const resolveExampleOptions = (opts: ExampleLoadOptions | undefined): ResolvedExampleOptions => {
  return {
    format: opts?.format ?? 'example',
    strict: opts?.strict ?? true,
  };
};

/** A type that acquires nothing, so these cases exercise identity and options alone. */
abstract class SourcelessAssetType<Resource, Options> extends AssetType<void, Resource, Options> {
  public override unacquiredSource(): { source: void } {
    return { source: undefined };
  }
}

// ---------------------------------------------------------------------------
// Type-level tests
// ---------------------------------------------------------------------------

describe('AssetType option typing', () => {
  it('a type without options: the factory sees options as undefined', () => {
    const factory: AssetFactory<void, ExampleAsset> = {
      async create(_source, context) {
        expectTypeOf(context.options).toEqualTypeOf<undefined>();

        return new ExampleAsset();
      },
    };

    expectTypeOf(factory).toMatchTypeOf<AssetFactory<void, ExampleAsset>>();
  });

  it('a type with options: the factory and the identity hooks see them typed and optional', () => {
    class Typed extends SourcelessAssetType<ExampleAsset, ExampleLoadOptions> {
      public readonly id = 'typed';

      public override resourceIdentity(request: AssetRequest<ExampleLoadOptions>): string {
        expectTypeOf(request.options).toEqualTypeOf<ExampleLoadOptions | undefined>();

        return request.source;
      }

      public createFactory(): AssetFactory<void, ExampleAsset, ExampleLoadOptions> {
        return {
          async create(_source, context) {
            expectTypeOf(context.options).toEqualTypeOf<ExampleLoadOptions | undefined>();

            return new ExampleAsset();
          },
        };
      }
    }

    expectTypeOf(new Typed()).toMatchTypeOf<AssetType<void, ExampleAsset, ExampleLoadOptions>>();
  });

  it('the identity hooks and the factory agree on the request the type declared', () => {
    type RequestInResourceIdentity = Parameters<NonNullable<AssetType<void, ExampleAsset, ExampleLoadOptions>['resourceIdentity']>>[0];
    type RequestInSourceIdentity = Parameters<NonNullable<AssetType<void, ExampleAsset, ExampleLoadOptions>['sourceIdentity']>>[0];

    expectTypeOf<RequestInResourceIdentity>().toEqualTypeOf<RequestInSourceIdentity>();
    expectTypeOf<RequestInResourceIdentity>().toEqualTypeOf<AssetRequest<ExampleLoadOptions>>();
  });

  it('a type without options cannot access typed option properties', () => {
    const factory: AssetFactory<void, ExampleAsset> = {
      async create(_source, context) {
        // @ts-expect-error - options is undefined, no .format property
        void context.options?.format;

        return new ExampleAsset();
      },
    };

    void factory;
  });

  it('a type with options rejects unknown option properties', () => {
    const factory: AssetFactory<void, ExampleAsset, ExampleLoadOptions> = {
      async create(_source, context) {
        // @ts-expect-error - unknownField is not part of ExampleLoadOptions
        void context.options?.unknownField;

        return new ExampleAsset();
      },
    };

    void factory;
  });

  it('a factory that builds the wrong resource is rejected', () => {
    const _factory: AssetFactory<void, ExampleAsset, ExampleLoadOptions> = {
      // @ts-expect-error - OtherAsset is not assignable to ExampleAsset
      async create(): Promise<OtherAsset> {
        return new OtherAsset();
      },
    };

    void _factory;
  });

  it('a codec must read back the source its factory consumes', () => {
    const _codec: AssetSourceCodec<ExampleAsset, string> = {
      fromResponse: response => response.text(),
      // @ts-expect-error - decode has to produce ExampleAsset, not a string
      decode: stored => Promise.resolve(stored),
    };

    void _codec;
  });
});

// ---------------------------------------------------------------------------
// Runtime identity tests
// ---------------------------------------------------------------------------

describe('option-driven identity', () => {
  let loader: Loader;

  beforeEach(() => {
    loader = new Loader();
  });

  /** `example`: identity covers format + strict, and never trace. */
  const exampleType = (
    id: string,
    onCreate: (options: ResolvedExampleOptions, context: AssetFactoryContext<ExampleLoadOptions>) => void,
  ): AssetType<void, ExampleAsset, ExampleLoadOptions> => {
    class Example extends SourcelessAssetType<ExampleAsset, ExampleLoadOptions> {
      public readonly id = id;
      public override readonly _token = ExampleAsset;

      public override resourceIdentity(request: AssetRequest<ExampleLoadOptions>): string {
        const resolved = resolveExampleOptions(request.options);

        return [resolved.format, String(resolved.strict)].join('|');
      }

      public createFactory(): AssetFactory<void, ExampleAsset, ExampleLoadOptions> {
        return {
          async create(_source, context) {
            onCreate(resolveExampleOptions(context.options), context);

            return new ExampleAsset();
          },
        };
      }
    }

    return new Example();
  };

  it('one source and one set of identity-relevant options is one load', async () => {
    let loadCount = 0;

    materializeAssetTypes(loader, [exampleType('example', () => loadCount++)]);

    const a1 = new Asset({ type: 'example', source: 'file.dat', format: 'example', strict: true });
    const a2 = new Asset({ type: 'example', source: 'file.dat', format: 'example', strict: true });

    await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('the same request loaded twice returns the same resource', async () => {
    const calls: ResolvedExampleOptions[] = [];

    materializeAssetTypes(loader, [exampleType('example', options => calls.push(options))]);

    const a1 = new Asset({ type: 'example', source: 'world.dat', format: 'example', strict: true });
    const a2 = new Asset({ type: 'example', source: 'world.dat', format: 'example', strict: true });

    const [r1, r2] = await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(calls).toHaveLength(1);
    expect(r1).toBe(r2);
    loader.destroy();
  });

  it('different result-changing options produce separate identities', async () => {
    const calls: boolean[] = [];

    materializeAssetTypes(loader, [exampleType('example', options => calls.push(options.strict))]);

    const strict = new Asset({ type: 'example', source: 'data.dat', strict: true });
    const lenient = new Asset({ type: 'example', source: 'data.dat', strict: false });

    const [r1, r2] = await Promise.all([loader.load(strict), loader.load(lenient)]);

    expect(calls).toHaveLength(2);
    expect(r1).not.toBe(r2);
    loader.destroy();
  });

  it('omitted options and explicit defaults are one identity, because the hook normalizes', async () => {
    let loadCount = 0;

    materializeAssetTypes(loader, [exampleType('example', () => loadCount++)]);

    const noOpts = new Asset({ type: 'example', source: 'map.dat' });
    const explicitDefaults = new Asset({ type: 'example', source: 'map.dat', format: 'example', strict: true });

    await Promise.all([loader.load(noOpts), loader.load(explicitDefaults)]);

    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('a control-only option the hook excludes does not affect identity', async () => {
    let loadCount = 0;

    materializeAssetTypes(loader, [exampleType('traceExample', () => loadCount++)]);

    const withTrace = new Asset({ type: 'traceExample', source: 'asset.dat', trace: true });
    const withoutTrace = new Asset({ type: 'traceExample', source: 'asset.dat', trace: false });

    await Promise.all([loader.load(withTrace), loader.load(withoutTrace)]);

    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('a type without a resource identity hook keeps source-based identity', async () => {
    let loadCount = 0;

    class Simple extends SourcelessAssetType<ExampleAsset, undefined> {
      public readonly id = 'simpleExample';
      public override readonly _token = ExampleAsset;

      public createFactory(): AssetFactory<void, ExampleAsset> {
        return {
          async create() {
            loadCount++;

            return new ExampleAsset();
          },
        };
      }
    }

    materializeAssetTypes(loader, [new Simple()]);

    const a1 = new Asset({ type: 'simpleExample', source: 'shared.dat' });
    const a2 = new Asset({ type: 'simpleExample', source: 'shared.dat' });

    await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(loadCount).toBe(1);
    loader.destroy();
  });

  it('the factory is torn down with the loader', () => {
    let destroyed = false;

    class Destroyable extends SourcelessAssetType<ExampleAsset, undefined> {
      public readonly id = 'destroyable';
      public override readonly _token = ExampleAsset;

      public createFactory(): AssetFactory<void, ExampleAsset> {
        return {
          create: async () => new ExampleAsset(),
          destroy() {
            destroyed = true;
          },
        };
      }
    }

    materializeAssetTypes(loader, [new Destroyable()]);
    loader.destroy();

    expect(destroyed).toBe(true);
  });

  it('the factory receives the request options, and the source as the caller wrote it', async () => {
    let seen: AssetFactoryContext<ExampleLoadOptions> | undefined;

    materializeAssetTypes(loader, [exampleType('captureExample', (_options, context) => void (seen = context))]);

    await expect(loader.load(new Asset({ type: 'captureExample', source: 'thing.dat', format: 'alt', strict: false }))).resolves.toBeInstanceOf(ExampleAsset);

    expect(seen?.source).toBe('thing.dat');
    expect(seen?.options).toEqual({ format: 'alt', strict: false });
    loader.destroy();
  });

  it('a request with no options carries no options key at all', async () => {
    let seen: AssetFactoryContext<ExampleLoadOptions> | undefined;

    materializeAssetTypes(loader, [exampleType('captureNoOpts', (_options, context) => void (seen = context))]);

    await expect(loader.load(new Asset({ type: 'captureNoOpts', source: 'thing.dat' }))).resolves.toBeInstanceOf(ExampleAsset);

    expect(seen?.source).toBe('thing.dat');
    expect(seen?.options).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(seen, 'options')).toBe(false);
    loader.destroy();
  });
});

// ---------------------------------------------------------------------------
// Module-augmentation test: AssetDefinitions remains augmentable
// ---------------------------------------------------------------------------

declare module '#assets/AssetDefinitions' {
  interface AssetDefinitions {
    example: {
      resource: ExampleAsset;
      config: { source: string; format?: 'example' | 'alt'; strict?: boolean; trace?: boolean };
    };
    traceExample: {
      resource: ExampleAsset;
      config: { source: string; format?: 'example' | 'alt'; strict?: boolean; trace?: boolean };
    };
    simpleExample: {
      resource: ExampleAsset;
      config: { source: string };
    };
    captureExample: {
      resource: ExampleAsset;
      config: { source: string; format?: 'example' | 'alt'; strict?: boolean; trace?: boolean };
    };
    captureNoOpts: {
      resource: ExampleAsset;
      config: { source: string };
    };
  }
}
