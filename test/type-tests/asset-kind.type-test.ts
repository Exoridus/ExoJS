// Type contract for asset descriptors named by a built-in type id.
// Compiled by `tsconfig.type-tests.json` (strict:false example
// project) via `pnpm typecheck:type-tests`, NOT collected by vitest (no
// `.test.ts` suffix). This is the hard type-level guarantee that a plain
// `{ type, source, ...options }` object is strongly typed by its type id, not a
// `string`-keyed bag.

import {
  type AssetDescriptorLeafPolicy,
  type AssetDescriptorResource,
  type CoreValueAssetKind,
  Json,
  type LeaflessAssetKind,
  Loader,
  type Texture,
  type ValueAssetKind,
} from '@codexo/exojs';

import { LoadPriority } from '#assets/Loader';

// Compile-time exact-type assertion, independent of vitest/expectTypeOf so a bare
// `tsc --noEmit` validates it (mirrors assets-strict-false.type-test.ts).
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface LevelData {
  readonly width: number;
  readonly height: number;
}

// (1) resource inference from the type id - no generic at all.
const shipDesc = { type: 'texture', source: 'p.png' } as const;
type _ShipIsTexture = Expect<Equal<AssetDescriptorResource<typeof shipDesc>, Texture>>;
type _ShipIsResourceLeaf = Expect<Equal<AssetDescriptorLeafPolicy<typeof shipDesc>, 'resource'>>;

// (2) value type: `parse` types the decoded value.
const levelDesc = { type: 'json', source: 'l.json', parse: (raw: unknown) => raw as LevelData } as const;
type _LevelIsTyped = Expect<Equal<AssetDescriptorResource<typeof levelDesc>, LevelData>>;
type _LevelIsValueLeaf = Expect<Equal<AssetDescriptorLeafPolicy<typeof levelDesc>, 'ref'>>;

// (3) value type without `parse` stays unknown.
const rawJson = { type: 'json', source: 'l.json' } as const;
type _RawJsonUnknown = Expect<Equal<AssetDescriptorResource<typeof rawJson>, unknown>>;

// (4) type-specific options are accepted.
const withOpts = { type: 'texture', source: 'p.png', mimeType: 'image/png' } as const;

const loader = new Loader();

loader.identify(withOpts);

// -- Negatives - each MUST fail to compile ----------------------------------------

// @ts-expect-error - `parse` is not allowed on a resource type (its resource is fixed).
loader.identify({ type: 'texture', source: 'p.png', parse: (raw: unknown) => raw as LevelData });

// @ts-expect-error - a wrong-type option is rejected.
loader.identify({ type: 'texture', source: 'p.png', delimiter: ',' });

// @ts-expect-error - a missing source is rejected for a built-in type.
loader.identify({ type: 'texture' });

// Load options (priority) apply to every input; per-asset options stay on the descriptor.
loader.load('l.json', { priority: LoadPriority.Background });
loader.load(levelDesc, { priority: LoadPriority.Background });
// @ts-expect-error - per-asset options are not load options.
loader.load('l.png', { textureOptions: {} });

// @ts-expect-error - descriptor options belong on the descriptor, not a second get() argument.
loader.get(levelDesc, { delimiter: ',' });

// Named groups of descriptors are loaded field by field.
loader.load({ config: { type: 'json', source: 'l.json' } });

// @ts-expect-error - the removed two-argument constructor form must stay gone.
loader.get(Json, 'l.json');

// @ts-expect-error - the removed two-argument constructor form must stay gone.
loader.load(Json, 'l.json');

// @ts-expect-error - the removed [Type, source] tuple form must stay gone.
loader.load([Json, 'l.json']);

// @ts-expect-error - registerType takes the string AssetDefinitions discriminator, not a constructor.
loader.registerType('json', Json);

// (n) the kind sets public signatures are written in are importable by name, so
// an extension can spell the set its declaration-merged type joins.
type _JsonIsValueKind = Expect<Equal<Extract<ValueAssetKind, 'json'>, 'json'>>;
type _CoreValueKindsAreValueKinds = Expect<Equal<Extract<CoreValueAssetKind, ValueAssetKind>, CoreValueAssetKind>>;
type _VideoIsLeafless = Expect<Equal<Extract<LeaflessAssetKind, 'video'>, 'video'>>;

export type {
  _CoreValueKindsAreValueKinds,
  _JsonIsValueKind,
  _LevelIsTyped,
  _LevelIsValueLeaf,
  _RawJsonUnknown,
  _ShipIsResourceLeaf,
  _ShipIsTexture,
  _VideoIsLeafless,
};
