// Type contract for a first-class `AssetType`.
//
// The point of the whole seam is that a custom asset type is fully typed
// WITHOUT declaration merging: nothing below augments `AssetDefinitions` or
// `ExtensionKindMap`, and the resource and option types still reach every call
// site. Compiled by `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`,
// not collected by vitest (no `.test.ts` suffix).

import {
  type AssetDescriptorLeafPolicy,
  type AssetDescriptorResource,
  type AssetFactory,
  type AssetRequest,
  type AssetSourceCodec,
  AssetType,
  type Extension,
  jsonSourceCodec,
  type Loader,
  type LoadingQueue,
  textSourceCodec,
} from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface WorldData {
  readonly name: string;
}

declare class World {
  readonly data: WorldData;
}

interface WorldOptions {
  readonly locale?: string;
  readonly palette?: 'dusk' | 'dawn';
}

class WorldAssetType extends AssetType<WorldData, World, WorldOptions, string> {
  public readonly id = 'com.example.world';
  public override readonly extensions = ['world'];
  public override readonly codec = jsonSourceCodec as AssetSourceCodec<WorldData, string>;

  public override resourceIdentity({ options }: AssetRequest<WorldOptions>): string {
    return options?.palette ?? '';
  }

  public override sourceIdentity({ options }: AssetRequest<WorldOptions>): string {
    return options?.locale ?? '';
  }

  public createFactory(): AssetFactory<WorldData, World, WorldOptions> {
    return {
      create: (source, context) => {
        // (1) The factory sees the type's own source and option types.
        type _SourceIsWorldData = Expect<Equal<typeof source, WorldData>>;
        type _OptionsAreWorldOptions = Expect<Equal<typeof context.options, WorldOptions | undefined>>;

        // (2) The factory context reaches assets, never bytes: no fetch, no
        //     cache store, no cache policy is nameable on it.
        // @ts-expect-error - a factory cannot fetch.
        void context.fetchText;
        // @ts-expect-error - nor reach a cache store.
        void context.stores;
        // @ts-expect-error - nor the loader that owns the policy.
        void context.loader;

        // (3) The dependency seam acquires assets, and cannot release or tear
        //     down the scope its parent owns.
        void context.dependencies.load;
        void context.dependencies.get;
        // @ts-expect-error - releasing the parent's scope is not a factory's call.
        void context.dependencies.release;
        // @ts-expect-error - nor is destroying it.
        void context.dependencies.destroy;
        // @ts-expect-error - nor opening a child scope, which could release or be destroyed.
        void context.dependencies.createScope;

        return Promise.resolve({} as World);
      },
    };
  }
}

const worldType = new WorldAssetType();
declare const loader: Loader;

// (4) The descriptor is typed by the type instance alone, and carries its leaf
// policy - the default `'ref'` here.
const level = { type: worldType, source: 'level.world' };
type _DescriptorCarriesResource = Expect<Equal<AssetDescriptorResource<typeof level>, World>>;
type _DescriptorIsValueLeaf = Expect<Equal<AssetDescriptorLeafPolicy<typeof level>, 'ref'>>;

// (5) So the load resolves to the resource, with no generic at the call site.
const loading = loader.load({ type: worldType, source: 'level.world' });
type _QueueResolvesToWorld = Expect<Equal<typeof loading, LoadingQueue<World>>>;

// (6) Options are the type's own, and are checked.
loader.identify({ type: worldType, source: 'level.world', locale: 'de', palette: 'dusk' });
// @ts-expect-error - 'noon' is not one of this type's palettes.
loader.identify({ type: worldType, source: 'level.world', palette: 'noon' });
// @ts-expect-error - an option this type does not declare is rejected.
loader.identify({ type: worldType, source: 'level.world', mimeType: 'application/json' });

// (6b) A source that is not a locator is the type's own factory source, handed
// over unfetched; a source-free descriptor builds from options alone.
const inline = loader.load({ type: worldType, source: { name: 'inline' } });
type _InlineResolvesToWorld = Expect<Equal<typeof inline, LoadingQueue<World>>>;
const sourceFree = loader.load({ type: worldType, palette: 'dawn' });
type _SourceFreeResolvesToWorld = Expect<Equal<typeof sourceFree, LoadingQueue<World>>>;
// @ts-expect-error - a source must be a locator or the type's own source shape.
loader.load({ type: worldType, source: 42 });
// @ts-expect-error - get() hands out a placeholder keyed by locator.
loader.get({ type: worldType, source: { name: 'inline' } });

// (7) A type that takes no options accepts none.
class NoteAssetType extends AssetType<string, string[]> {
  public readonly id = 'com.example.note';
  public override readonly codec = textSourceCodec;

  public createFactory(): AssetFactory<string, string[]> {
    return { create: text => Promise.resolve(text.split('\n')) };
  }
}

const noteType = new NoteAssetType();
const note = { type: noteType, source: 'a.note' };
type _NoteIsStringArray = Expect<Equal<AssetDescriptorResource<typeof note>, string[]>>;
// @ts-expect-error - this type declares no options at all.
loader.identify({ type: noteType, source: 'a.note', locale: 'de' });

// (8) Both kinds of type go in one extension's asset list.
const extension: Extension = {
  id: 'com.example.world',
  assets: [worldType, noteType],
};
void extension;

// (9) A codec's stored representation is what its own reader produces.
const storedJson: AssetSourceCodec<unknown, string> = jsonSourceCodec;
type _JsonStoresText = Expect<Equal<Awaited<ReturnType<typeof storedJson.fromResponse>>, string>>;
