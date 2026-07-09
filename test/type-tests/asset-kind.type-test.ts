// Type contract for the `Asset.kind()` descriptor builder (asset-system v2
// delta §3). Compiled by `tsconfig.type-tests.json` (strict:false example
// project) via `pnpm typecheck:type-tests`, NOT collected by vitest (no
// `.test.ts` suffix). This is the hard type-level guarantee that `Asset.kind`
// is a strongly typed builder, not a `string`-keyed helper — without it,
// `Asset.kind` would be a regression over the `.of()` statics it replaces.

import { Asset, type Texture } from '@codexo/exojs';

// Compile-time exact-type assertion, independent of vitest/expectTypeOf so a bare
// `tsc --noEmit` validates it (mirrors assets-strict-false.type-test.ts).
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface LevelData {
  readonly width: number;
  readonly height: number;
}

// (1) resource inference from kind — no <T>, resource type comes from the kind.
const shipDesc = Asset.kind('texture', 'p.png');
type _ShipIsTexture = Expect<Equal<typeof shipDesc, Asset<Texture>>>;

// (2) value kind: <T> annotates the decoded value.
const levelDesc = Asset.kind<LevelData>('json', 'l.json');
type _LevelIsTyped = Expect<Equal<typeof levelDesc, Asset<LevelData>>>;

// (3) value kind without <T> stays unknown.
const rawJson = Asset.kind('json', 'l.json');
type _RawJsonUnknown = Expect<Equal<typeof rawJson, Asset<unknown>>>;

// (4) kind-specific options are accepted.
const withOpts = Asset.kind('texture', 'p.png', { mimeType: 'image/png' });
void withOpts;

// ── Negatives — each MUST fail to compile ─────────────────────────────────────

// @ts-expect-error — <T> is not allowed on a resource kind (type fixed by kind).
Asset.kind<LevelData>('texture', 'p.png');

// @ts-expect-error — an unregistered kind is not widened to string.
Asset.kind('nope', 'x.bin');

// @ts-expect-error — a wrong-kind option is rejected.
Asset.kind('texture', 'p.png', { delimiter: ',' });

export type { _LevelIsTyped, _RawJsonUnknown, _ShipIsTexture };
void Asset;
