// Type contract for a first-class `AssetType`.
//
// The point of the whole seam is that a custom asset type is fully typed
// WITHOUT declaration merging: nothing below augments `AssetDefinitions` or
// `ExtensionKindMap`, and the resource and option types still reach every call
// site. Compiled by `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`,
// not collected by vitest (no `.test.ts` suffix).

import {
  type Asset,
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
  public readonly codec = jsonSourceCodec as AssetSourceCodec<WorldData, string>;

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

        return Promise.resolve({} as World);
      },
    };
  }
}

const worldType = new WorldAssetType();
declare const loader: Loader;

// (4) The descriptor is typed by the type instance alone.
const level = worldType.asset('level.world');
type _DescriptorCarriesResource = Expect<Equal<typeof level, Asset<World>>>;

// (5) So the load resolves to the resource, with no generic at the call site.
const loading = loader.load(worldType.asset('level.world'));
type _QueueResolvesToWorld = Expect<Equal<typeof loading, LoadingQueue<World>>>;

// (6) Options are the type's own, and are checked.
worldType.asset('level.world', { locale: 'de', palette: 'dusk' });
// @ts-expect-error - 'noon' is not one of this type's palettes.
worldType.asset('level.world', { palette: 'noon' });
// @ts-expect-error - an option this type does not declare is rejected.
worldType.asset('level.world', { mimeType: 'application/json' });

// (7) A type that takes no options accepts none.
class NoteAssetType extends AssetType<string, string[]> {
  public readonly id = 'com.example.note';
  public readonly codec = textSourceCodec;

  public createFactory(): AssetFactory<string, string[]> {
    return { create: text => Promise.resolve(text.split('\n')) };
  }
}

const noteType = new NoteAssetType();
const note = noteType.asset('a.note');
type _NoteIsStringArray = Expect<Equal<typeof note, Asset<string[]>>>;
// @ts-expect-error - this type declares no options at all.
noteType.asset('a.note', { locale: 'de' });

// (8) Both kinds of type go in one extension's asset list.
const extension: Extension = {
  id: 'com.example.world',
  assets: [worldType, noteType],
};
void extension;

// (9) A codec's stored representation is what its own reader produces.
const storedJson: AssetSourceCodec<unknown, string> = jsonSourceCodec;
type _JsonStoresText = Expect<Equal<Awaited<ReturnType<typeof storedJson.fromResponse>>, string>>;
