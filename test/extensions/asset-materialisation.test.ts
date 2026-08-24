import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Asset } from '#assets/Asset';
import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import type { AnyAssetType } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

// Minimal test asset types
class TypeA {}
class TypeB {}

declare module '#assets/AssetDefinitions' {
  interface AssetDefinitions {
    withOpts: { resource: unknown; config: { source: string; family?: string; size?: number } };
    noOpts: { resource: unknown; config: { source: string } };
    testType: { resource: unknown; config: { source: string } };
  }
}

interface SpiedType {
  readonly type: AnyAssetType;
  readonly createFactory: ReturnType<typeof vi.fn>;
  readonly create: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

/**
 * An installable type whose `createFactory`, `create` and `destroy` are all
 * observable, so the install contract can be asserted without a real asset.
 */
function spiedType(spec: { id: string; token?: object; extensions?: readonly string[] } = { id: 'testType' }): SpiedType {
  const create = vi.fn(async (_source: string, _context: AssetFactoryContext<Record<string, unknown>>) => ({}));
  const destroy = vi.fn();
  const createFactory = vi.fn((): AssetFactory<string, unknown, Record<string, unknown>> => ({ create, destroy }));

  class Spied extends AssetType<string, unknown, Record<string, unknown>> {
    public readonly id = spec.id;
    public override readonly extensions = spec.extensions ?? [];
    public override readonly leaf = 'none' as const;
    public override readonly _token = spec.token as never;
    public override readonly codec: AssetSourceCodec<string> = {
      fromResponse: response => response.text(),
      fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
      decode: stored => Promise.resolve(stored),
    };

    public override unacquiredSource(): { source: string } {
      return { source: '' };
    }

    public createFactory(): AssetFactory<string, unknown, Record<string, unknown>> {
      return createFactory();
    }
  }

  return { type: new Spied() as AnyAssetType, createFactory, create, destroy };
}

describe('materializeAssetTypes', () => {
  beforeEach(() => {});

  it('builds one factory per loader per type', () => {
    const spied = spiedType({ id: 'testType', token: TypeA });
    const loader = new Loader();

    materializeAssetTypes(loader, [spied.type]);

    expect(spied.createFactory).toHaveBeenCalledTimes(1);
    loader.destroy();
  });

  it('two applications sharing one descriptor still get their own factory', () => {
    const spied = spiedType({ id: 'testType', token: TypeA });
    const loaderA = new Loader();
    const loaderB = new Loader();

    materializeAssetTypes(loaderA, [spied.type]);
    materializeAssetTypes(loaderB, [spied.type]);

    expect(spied.createFactory).toHaveBeenCalledTimes(2);
    loaderA.destroy();
    loaderB.destroy();
  });

  it('loader.hasLoadable reflects the install', () => {
    const spied = spiedType({ id: 'testType', token: TypeA });
    const loader = new Loader();

    materializeAssetTypes(loader, [spied.type]);

    expect(loader.hasLoadable(TypeA as never)).toBe(true);
    loader.destroy();
  });

  it('two types dispatching on one constructor throw before any mutation', () => {
    const first = spiedType({ id: 'first', token: TypeA });
    const second = spiedType({ id: 'second', token: TypeA, extensions: ['late'] });
    const loader = new Loader();

    expect(() => materializeAssetTypes(loader, [first.type, second.type])).toThrow('another installed type already uses');
    expect(loader.hasLoadable(TypeA as never)).toBe(false);
    expect(loader.hasExtension('late')).toBe(false);
    loader.destroy();
  });

  it('a duplicate id throws before any mutation', () => {
    const first = spiedType({ id: 'testType', token: TypeA });
    const second = spiedType({ id: 'testType', token: TypeB, extensions: ['late'] });
    const loader = new Loader();

    expect(() => materializeAssetTypes(loader, [first.type, second.type])).toThrow('Asset type id "testType" is already installed');
    expect(loader.hasAssetType('testType')).toBe(false);
    expect(loader.hasExtension('late')).toBe(false);
    loader.destroy();
  });

  it('a duplicate suffix throws before any mutation', () => {
    const first = spiedType({ id: 'first', token: TypeA, extensions: ['shared'] });
    const second = spiedType({ id: 'second', token: TypeB, extensions: ['shared'] });
    const loader = new Loader();

    expect(() => materializeAssetTypes(loader, [first.type, second.type])).toThrow('already claimed by asset type');
    expect(loader.hasAssetType('first')).toBe(false);
    expect(loader.hasExtension('shared')).toBe(false);
    loader.destroy();
  });

  it('equivalent suffix spellings collide, because every table normalizes the same way', () => {
    const first = spiedType({ id: 'first', token: TypeA, extensions: ['.PNGX'] });
    const second = spiedType({ id: 'second', token: TypeB, extensions: ['pngx'] });
    const loader = new Loader();

    expect(() => materializeAssetTypes(loader, [first.type, second.type])).toThrow('already claimed by asset type');
    loader.destroy();
  });

  it('a suffix is normalised on install: dots stripped, lower-cased', () => {
    const spied = spiedType({ id: 'testType', token: TypeA, extensions: ['..MiXeD'] });
    const loader = new Loader();

    materializeAssetTypes(loader, [spied.type]);

    expect(loader.hasExtension('mixed')).toBe(true);
    expect(loader.hasExtension('.MIXED')).toBe(true);
    expect(loader.resolveExtensionType('mixed')).toBe('testType');
    loader.destroy();
  });

  it('an installed id is reported by hasAssetType', () => {
    const spied = spiedType({ id: 'testType', token: TypeA });
    const loader = new Loader();

    materializeAssetTypes(loader, [spied.type]);

    expect(loader.hasAssetType('testType')).toBe(true);
    loader.destroy();
  });

  it('the factory receives per-load options under its own options key', async () => {
    const spied = spiedType({ id: 'withOpts', token: TypeA });
    const loader = new Loader();

    materializeAssetTypes(loader, [spied.type]);

    await loader.load(new Asset({ type: 'withOpts', source: 'x.dat', family: 'Inter', size: 12 }));

    expect(spied.create).toHaveBeenCalledWith('', expect.objectContaining({ source: 'x.dat', options: { family: 'Inter', size: 12 } }));
    loader.destroy();
  });

  it('a request with no options carries no options key at all', async () => {
    const spied = spiedType({ id: 'noOpts', token: TypeA });
    const loader = new Loader();

    materializeAssetTypes(loader, [spied.type]);

    await loader.load(new Asset({ type: 'noOpts', source: 'x.dat' }));

    const context = spied.create.mock.calls[0]![1] as AssetFactoryContext<Record<string, unknown>>;

    expect(context.options).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(context, 'options')).toBe(false);
    loader.destroy();
  });

  it('the factory is destroyed with the loader', () => {
    const spied = spiedType({ id: 'testType', token: TypeA });
    const loader = new Loader();

    materializeAssetTypes(loader, [spied.type]);
    loader.destroy();

    expect(spied.destroy).toHaveBeenCalledTimes(1);
  });
});
