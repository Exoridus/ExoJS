import { runInNewContext } from 'node:vm';

import type { AssetDescriptor } from '#assets/AssetDescriptor';
import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { Assets } from '#assets/Assets';
import { type AnyAssetType, type AssetRequest, AssetType } from '#assets/AssetType';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, LoadPriority } from '#assets/Loader';
import { textureSeamlessAdapter } from '#assets/seamless';
import { Json } from '#assets/tokens';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

import { testAssetType } from './test-asset-type';

class Field {
  public disposed = false;

  public constructor(
    public readonly values: readonly number[],
    public readonly scale: number,
  ) {}
}

interface FieldOptions {
  readonly scale?: number;
}

/** Builds a field straight from in-memory samples; it never acquires data. */
class FieldType extends AssetType<readonly number[] | undefined, Field, FieldOptions> {
  public readonly id = 'test.field';
  public readonly created: Array<{ source: unknown; context: AssetFactoryContext<FieldOptions> }> = [];
  public gate: Promise<void> | undefined;

  public createFactory(): AssetFactory<readonly number[] | undefined, Field, FieldOptions> {
    return {
      create: async (source, context) => {
        this.created.push({ source, context });
        await this.gate;

        return new Field(source ?? [], context.options?.scale ?? 1);
      },
      dispose: field => {
        field.disposed = true;
      },
    };
  }
}

/** A source-free type whose seed is its whole resource identity. */
class NoiseType extends AssetType<undefined, Field, { readonly seed: number }> {
  public readonly id = 'test.noise';

  public override resourceIdentity({ options }: AssetRequest<{ readonly seed: number }>): string {
    return String(options?.seed);
  }

  public createFactory(): AssetFactory<undefined, Field, { readonly seed: number }> {
    return { create: async (_source, context) => new Field([context.options?.seed ?? 0], 1) };
  }
}

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

const createLoader = (...types: AnyAssetType[]): Loader => {
  const loader = new Loader({ basePath: '/' });

  materializeAssetTypes(loader, coreAssetTypes);
  loader._installAssetTypes(types);

  return loader;
};

const claims = (loader: Loader, descriptor: AssetDescriptor): number => {
  const { resourceKey } = loader.identify(descriptor);

  return loader.inspect().find(row => row.canonicalKey === resourceKey)?.claims ?? 0;
};

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '{"hp":3}' }) as unknown as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe('descriptor sources', () => {
  test('a structured source and extra fields reach the factory without a fetch', async () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    const samples = [1, 2, 3];

    const field = await loader.load({ type: fields, source: samples, scale: 2 });

    expect(field.values).toBe(samples);
    expect(field.scale).toBe(2);
    expect(fields.created[0]?.source).toBe(samples);
    expect(fields.created[0]?.context.options).toEqual({ scale: 2 });
    expect(fields.created[0]?.context.source).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
    loader.destroy();
  });

  test('descriptors sharing a source object share one resource; an equal-looking copy does not', async () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    const samples = [1, 2, 3];

    const first = await loader.load({ type: fields, source: samples });
    const second = await loader.load({ type: fields, source: samples });
    const copy = await loader.load({ type: fields, source: [1, 2, 3] });

    expect(second).toBe(first);
    expect(copy).not.toBe(first);
    expect(fields.created).toHaveLength(2);
    loader.destroy();
  });

  test('an identity-relevant option still separates resources built from one source', async () => {
    class ScaledFieldType extends FieldType {
      public override resourceIdentity({ options }: AssetRequest<FieldOptions>): string {
        return String(options?.scale ?? 1);
      }
    }

    const fields = new ScaledFieldType();
    const loader = createLoader(fields);
    const samples = [1];

    const small = await loader.load({ type: fields, source: samples, scale: 1 });
    const large = await loader.load({ type: fields, source: samples, scale: 4 });

    expect(large).not.toBe(small);
    expect(await loader.load({ type: fields, source: samples, scale: 4 })).toBe(large);
    loader.destroy();
  });

  test('a source-free descriptor without a resource identity is identified by the descriptor object', async () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    const scope = loader.createScope();
    const descriptor = { type: fields, scale: 3 } as const;

    const first = await scope.load(descriptor);
    const again = await scope.load(descriptor);
    const separate = await scope.load({ type: fields, scale: 3 });

    expect(again).toBe(first);
    expect(separate).not.toBe(first);
    expect(fields.created[0]?.source).toBeUndefined();

    // An equal-looking literal names a different claim, so it releases nothing.
    scope.release({ type: fields, scale: 3 });
    expect(first.disposed).toBe(false);

    scope.release(descriptor);
    expect(first.disposed).toBe(true);

    // Without the descriptor object, the resource itself is the claim identity.
    scope.release(separate);
    expect(separate.disposed).toBe(true);
    scope.destroy();
    loader.destroy();
  });

  test('a source-free type with a resource identity makes equal descriptors one resource', async () => {
    const noise = new NoiseType();
    const loader = createLoader(noise);
    const scope = loader.createScope();

    const descriptor = { type: noise, seed: 7 };
    const a = await scope.load(descriptor);
    const b = await scope.load({ type: noise, seed: 7 });
    const c = await scope.load({ type: noise, seed: 8 });

    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(claims(loader, descriptor)).toBe(1);

    scope.release({ type: noise, seed: 7 });
    expect(claims(loader, descriptor)).toBe(0);
    scope.destroy();
    loader.destroy();
  });

  test('loading a released source-free key uses the new acquisition options', async () => {
    class GeneratedType extends FieldType {
      public override resourceIdentity(): string {
        return 'generated';
      }
    }

    const fields = new GeneratedType();
    const loader = createLoader(fields);
    const scope = loader.createScope();
    const first = await scope.load({ type: fields, scale: 2 });

    scope.release(first);

    const second = await scope.load({ type: fields, scale: 4 });

    expect(first.disposed).toBe(true);
    expect(second.scale).toBe(4);
    expect(fields.created).toHaveLength(2);
    loader.destroy();
  });

  test('equal primitive sources share one resource', async () => {
    class SeededType extends AssetType<number, Field> {
      public readonly id = 'test.seeded';

      public createFactory(): AssetFactory<number, Field> {
        return { create: async seed => new Field([seed], 1) };
      }
    }

    const seeded = new SeededType();
    const loader = createLoader(seeded);

    expect(await loader.load({ type: seeded, source: 3 })).toBe(await loader.load({ type: seeded, source: 3 }));
    expect(await loader.load({ type: seeded, source: 4 })).not.toBe(await loader.load({ type: seeded, source: 3 }));
    loader.destroy();
  });

  test('a string source stays a locator: it is fetched, and a class names the installed type', async () => {
    const loader = createLoader();

    await expect(loader.load({ type: Json, source: 'config.json' })).resolves.toEqual({ hp: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    loader.destroy();
  });
});

describe('direct resource lifecycle', () => {
  test('two owners share one direct resource until both release it', async () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    const first = loader.createScope();
    const second = loader.createScope();
    const samples = [5];
    const descriptor = { type: fields, source: samples };

    const a = await first.load(descriptor);
    const b = await second.load({ type: fields, source: samples });

    expect(b).toBe(a);
    expect(claims(loader, descriptor)).toBe(2);

    first.release({ type: fields, source: samples });
    expect(a.disposed).toBe(false);
    expect(claims(loader, descriptor)).toBe(1);

    second.destroy();
    expect(a.disposed).toBe(true);
    first.destroy();
    loader.destroy();
  });

  test('cancelling the only load of a direct resource disposes the late result', async () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    let open!: () => void;

    fields.gate = new Promise(resolve => {
      open = resolve;
    });
    loader.onError.add(() => {});

    const queue = loader.load({ type: fields, source: [9] });
    const settled = queue.then(
      () => 'resolved',
      (error: unknown) => (error as { name?: string } | null)?.name ?? String(error),
    );

    queue.cancel();
    open();

    expect(await settled).toBe('AbortError');
    expect(loader.inspect()).toHaveLength(0);
    loader.destroy();
  });

  test('reclaiming a cancelled direct key uses the replacement options', async () => {
    const late = new Field([], 2);
    let finish!: (field: Field) => void;
    const pending = new Promise<Field>(resolve => {
      finish = resolve;
    });
    const type = testAssetType<undefined, Field, FieldOptions>({
      id: 'test.cancelled-field',
      resourceIdentity: () => 'field',
      create: async (_source, { options }) => (options?.scale === 2 ? pending : new Field([], options?.scale ?? 1)),
      dispose: field => {
        field.disposed = true;
      },
    });
    const loader = createLoader(type);
    const abandoned = loader.load({ type, scale: 2 });

    abandoned.cancel();
    const replacement = loader.load({ type, scale: 4 });
    finish(late);

    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
    await expect(replacement).resolves.toMatchObject({ scale: 4, disposed: false });
    expect(late.disposed).toBe(true);
    loader.destroy();
  });

  test('a plain-object direct resource is released as itself, not read as a group or descriptor', async () => {
    class RecordType extends AssetType<undefined, { readonly type: string; readonly width: number }, { readonly width: number }> {
      public readonly id = 'test.record';

      public createFactory(): AssetFactory<undefined, { readonly type: string; readonly width: number }, { readonly width: number }> {
        return { create: async (_source, context) => ({ type: 'record', width: context.options?.width ?? 0 }) };
      }
    }

    const records = new RecordType();
    const loader = createLoader(records);
    const scope = loader.createScope();
    const descriptor = { type: records, width: 3 };
    const record = await scope.load(descriptor);

    expect(claims(loader, descriptor)).toBe(1);
    expect(() => scope.release(record)).not.toThrow();
    expect(claims(loader, descriptor)).toBe(0);

    // Released again after eviction, it is still the resource - not a group of its fields.
    const successor = { type: records, width: 3 };
    await scope.load(successor);

    expect(() => scope.release(record)).not.toThrow();
    expect(claims(loader, successor)).toBe(1);
    scope.destroy();
    loader.destroy();
  });

  test('releasing a stale direct resource leaves its rebuilt successor alone', async () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    const scope = loader.createScope();
    const samples = [1];
    const descriptor = { type: fields, source: samples };

    const first = await scope.load(descriptor);

    scope.release(first);
    expect(first.disposed).toBe(true);

    const second = await scope.load(descriptor);

    expect(second).not.toBe(first);
    expect(() => scope.release(first)).not.toThrow();
    expect(second.disposed).toBe(false);
    expect(claims(loader, descriptor)).toBe(1);
    scope.destroy();
    loader.destroy();
  });

  test('a directly loaded callable can be released by each owner', async () => {
    const dispose = vi.fn();
    const type = testAssetType<undefined, () => number>({ id: 'test.callable', create: async () => () => 42, dispose });
    const loader = createLoader(type);
    const first = loader.createScope();
    const second = loader.createScope();
    const descriptor = { type };
    const callable = await first.load(descriptor);

    expect(typeof callable).toBe('function');
    expect(await second.load(descriptor)).toBe(callable);
    expect(loader.inspect()).toMatchObject([{ claims: 2 }]);

    first.release(callable);
    expect(loader.inspect()).toMatchObject([{ claims: 1 }]);
    expect(dispose).not.toHaveBeenCalled();

    second.release(callable);
    second.release(callable);
    expect(loader.inspect()).toHaveLength(0);
    expect(dispose).toHaveBeenCalledExactlyOnceWith(callable);
    loader.destroy();
  });

  test('releasing a shared callable follows the releasing scope across direct keys', async () => {
    const callable = () => 42;
    const type = testAssetType<undefined, () => number>({ id: 'test.shared-callable', create: async () => callable });
    const loader = createLoader(type);
    const first = loader.createScope();
    const second = loader.createScope();
    const firstDescriptor = { type };
    const secondDescriptor = { type };

    expect(await first.load(firstDescriptor)).toBe(callable);
    expect(await second.load(secondDescriptor)).toBe(callable);
    second.release(callable);
    expect(loader.inspect()).toMatchObject([{ canonicalKey: loader.identify(firstDescriptor).resourceKey, claims: 1 }]);
    first.release(callable);
    expect(loader.inspect()).toHaveLength(0);

    await second.load({ type });
    await second.load({ type });
    expect(loader.inspect()).toHaveLength(2);
    second.release(callable);
    expect(loader.inspect()).toHaveLength(0);
    loader.destroy();
  });

  test('a direct resource with a seamless adapter never becomes a deferred handle', async () => {
    const type = testAssetType<number, Texture>({
      id: 'test.direct-texture',
      leaf: textureSeamlessAdapter,
      create: async width => {
        const canvas = document.createElement('canvas');

        canvas.width = width;

        return new Texture(canvas);
      },
    });
    const loader = createLoader(type);
    const scope = loader.createScope();
    const descriptor = { type, source: 8 };
    const first = await scope.load(descriptor);

    scope.release(first);

    const second = await scope.load(descriptor);

    expect(second).not.toBe(first);
    expect(second).toBeInstanceOf(Texture);
    scope.release(first);
    expect(claims(loader, descriptor)).toBe(1);
    loader.destroy();
  });

  test('a direct resource has no portable key or saved reference', async () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    const field = await loader.load({ type: fields, source: [1] });

    expect(loader.keyFor(field)).toBeNull();
    expect(loader._assetReference(field)).toMatchObject({ kind: 'error' });
    loader.destroy();
  });
});

describe('descriptor validation', () => {
  test('a class that no installed type produces throws before any claim', () => {
    class Unknown {}

    const loader = createLoader();

    expect(() => loader.load({ type: Unknown, source: 'a.bin' } as never)).toThrow();
    expect(loader.inspect()).toHaveLength(0);
    loader.destroy();
  });

  test('an id that no installed type has rejects through the queue, and its release is a no-op', async () => {
    const loader = createLoader();
    const scope = loader.createScope();
    const descriptor = { type: 'test.missing', source: 'a.bin' } as never;

    await expect(scope.load(descriptor)).rejects.toThrow(/no asset type "test\.missing" is installed/);
    expect(() => scope.release(descriptor)).not.toThrow();
    scope.destroy();
    loader.destroy();
  });

  test('parse runs on a value type and is rejected on a resource type', async () => {
    const loader = createLoader();

    await expect(loader.load({ type: 'json', source: 'config.json', parse: raw => (raw as { hp: number }).hp })).resolves.toBe(3);
    expect(() => loader.load({ type: Texture, source: 'a.png', parse: (raw: unknown) => raw } as never)).toThrow(
      /"parse" is a synchronous function for value asset types/,
    );
    loader.destroy();
  });

  test.each(['resolve', 'reject'])('all descriptor reads reject an asynchronous parser that will %s', async outcome => {
    const loader = createLoader();
    const descriptor = {
      type: 'json',
      source: 'config.json',
      parse: async () => {
        if (outcome === 'reject') {
          throw new Error('invalid value');
        }

        return 3;
      },
    } as const;
    const contractError = /parse\(\) must be synchronous/;

    await expect(loader.load(descriptor)).rejects.toThrow(contractError);
    await expect(loader.get(descriptor).loaded).rejects.toThrow(contractError);
    expect(() => loader.peek(descriptor)).toThrow(contractError);
    expect(loader.peek('config.json')).toEqual({ hp: 3 });
    loader.destroy();
  });

  test('a native promise from another realm rejects with the synchronous parser contract error', async () => {
    const loader = createLoader();
    const descriptor = {
      type: 'json',
      source: 'config.json',
      parse: () => runInNewContext('Promise.reject(new Error("parser failed"))') as Promise<never>,
    } as const;

    await expect(loader.load(descriptor)).rejects.toThrow(/parse\(\) must be synchronous/);
    loader.destroy();
  });

  test('parse never takes part in identity: load, peek and release agree with and without it', async () => {
    const loader = createLoader();
    const scope = loader.createScope();
    const claimsOnConfig = (): number => loader.inspect().find(row => row.locator.endsWith('config.json'))?.claims ?? 0;

    await expect(scope.load({ type: 'json', source: 'config.json', parse: raw => (raw as { hp: number }).hp })).resolves.toBe(3);
    expect(loader.peek({ type: 'json', source: 'config.json' })).toEqual({ hp: 3 });
    expect(claimsOnConfig()).toBe(1);

    scope.release({ type: 'json', source: 'config.json' });
    expect(claimsOnConfig()).toBe(0);
    scope.destroy();
    loader.destroy();
  });

  test('a descriptor without a string source has no placeholder form', () => {
    const fields = new FieldType();
    const loader = createLoader(fields);
    const direct = { type: fields, source: [1] } as never;

    expect(() => loader.load(direct, { priority: LoadPriority.Background })).toThrow(/no string source/);
    expect(() => loader.get(direct)).toThrow(/no string source/);
    expect(() => loader.cacheSource(direct)).toThrow(/needs a string source/);
    expect(() => Assets.from({ field: direct })).toThrow(/needs a string source/);
    loader.destroy();
  });

  test('a catalog resolves built-in classes but not classes it cannot see', () => {
    class Unknown {}

    expect(Assets.from({ hero: { type: Texture, source: 'hero.png' } }).hero).toBeInstanceOf(Texture);
    expect(() => Assets.from({ item: { type: Unknown, source: 'a.bin' } as never })).toThrow(/cannot resolve the class Unknown/);
  });
});
