// Type contract for the `Asset.type()` descriptor builder (asset-system v2
// delta §3). Compiled by `tsconfig.type-tests.json` (strict:false example
// project) via `pnpm typecheck:type-tests`, NOT collected by vitest (no
// `.test.ts` suffix). This is the hard type-level guarantee that `Asset.type`
// is a strongly typed builder, not a `string`-keyed helper - without it,
// `Asset.type` would be a regression over the `.of()` statics it replaces.

import { Asset, Json, Loader, type Texture, type ValueAsset } from '@codexo/exojs';

import { LoadPriority } from '#assets/Loader';

// Compile-time exact-type assertion, independent of vitest/expectTypeOf so a bare
// `tsc --noEmit` validates it (mirrors assets-strict-false.type-test.ts).
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface LevelData {
  readonly width: number;
  readonly height: number;
}

// (1) resource inference from kind - no <T>, resource type comes from the kind.
const shipDesc = Asset.type('texture', 'p.png');
type _ShipIsTexture = Expect<Equal<typeof shipDesc, Asset<Texture>>>;

// (2) value kind: <T> annotates the decoded value - branded ValueAsset.
const levelDesc = Asset.type<LevelData>('json', 'l.json');
type _LevelIsTyped = Expect<Equal<typeof levelDesc, ValueAsset<LevelData>>>;

// (3) value kind without <T> stays unknown - still branded.
const rawJson = Asset.type('json', 'l.json');
type _RawJsonUnknown = Expect<Equal<typeof rawJson, ValueAsset<unknown>>>;

// (4) kind-specific options are accepted.
const withOpts = Asset.type('texture', 'p.png', { mimeType: 'image/png' });
void withOpts;

// ── Negatives - each MUST fail to compile ─────────────────────────────────────

// @ts-expect-error - <T> is not allowed on a resource kind (type fixed by kind).
Asset.type<LevelData>('texture', 'p.png');

// @ts-expect-error - an unregistered kind is not widened to string.
Asset.type('nope', 'x.bin');

// @ts-expect-error - a wrong-kind option is rejected.
Asset.type('texture', 'p.png', { delimiter: ',' });

const loader = new Loader();

// @ts-expect-error - per-asset options belong on Asset.type(), not load(path, options).
loader.load('l.json', { priority: LoadPriority.Background });

// @ts-expect-error - descriptor options belong inside Asset.type(), not a second load() argument.
loader.load(levelDesc, { priority: LoadPriority.Background });

// @ts-expect-error - descriptor options belong inside Asset.type(), not a second get() argument.
loader.get(levelDesc, { delimiter: ',' });

// @ts-expect-error - inline record catalogs were removed; use Assets.from(...).
loader.load({ config: { type: 'json', source: 'l.json' } });

// @ts-expect-error - the removed two-argument constructor form must stay gone.
loader.get(Json, 'l.json');

// @ts-expect-error - the removed two-argument constructor form must stay gone.
loader.load(Json, 'l.json');

// @ts-expect-error - registerType takes the string AssetDefinitions discriminator, not a constructor.
loader.registerType('json', Json);

export type { _LevelIsTyped, _RawJsonUnknown, _ShipIsTexture };
void Asset;
