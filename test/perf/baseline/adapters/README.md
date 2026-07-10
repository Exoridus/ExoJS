# Baseline benchmark adapters

Each file here is one **arm** of the baseline benchmark: an object implementing
the neutral `EngineAdapter` contract (see `../EngineAdapter.ts`) that the harness
drives identically. `exojs.ts` is the committed, always-present arm. A second,
optional **reference** arm can be dropped in locally.

The harness names no engine. Arms are reported purely by their own `engine` and
`config` labels — the committed tree contains exactly one label, `exojs`.

## The reference adapter slot

To measure ExoJS against another renderer on your own machine, add a single
file:

- **File name (exact):** `reference.local.ts`, in this directory.
- **Gitignored:** the `.local.ts` suffix is listed in the repository
  `.gitignore`, so it is never committed. Nothing about the other engine — not
  its name, not a dependency entry, not a number — enters the tracked tree.
- **Dependency:** install whatever the reference arm imports as a **local-only
  dev dependency** (e.g. `pnpm add -D <package> --filter <this workspace>` on
  your machine only, then revert the lockfile before committing — or use a file:/
  link). Do not commit it.
- **Discovery:** the harness discovers the module at runtime via
  `import.meta.glob('../adapters/reference.local.ts')` in `../page/harness.ts`.
  When the file is absent the glob is empty, so the benchmark runs ExoJS-only
  with no failed import and no build break. The slot is strictly **additive**:
  the committed ExoJS-only run (WebGL2 vs WebGPU, the node-count sweep, the
  structural counters) is fully useful on its own.

### Export

The module must export a factory:

```ts
import type { EngineAdapter } from '../EngineAdapter';

export const createReferenceAdapters = (): EngineAdapter[] => {
  // return one OR two adapters — see "Two configs" below
};
```

It runs **in the browser page**, not in the Node driver, so it may freely use
`document`, WebGL2/WebGPU and the reference engine's browser runtime.

### The `EngineAdapter` contract

Every arm implements (full JSDoc in `../EngineAdapter.ts`):

- `engine: string` — arm label, e.g. `'reference'`. Reported verbatim.
- `config: string` — configuration label, e.g. `'immediate'` or `'retained'`.
- `supports(backend): boolean` — `true` for each backend (`'webgl2'` /
  `'webgpu'`) this arm can run. Unsupported backends are skipped, not failed.
- `init(canvas, backend): Promise<void>` — create the engine against the given
  canvas and backend. Pin the backend explicitly; never auto-select.
- `buildScene(spec, nodeCount, seed): void` — build the scene for the archetype
  (see fairness rules below).
- `mutate(frame): void` — apply the archetype's per-frame mutation.
- `renderFrame(): void` — render exactly one frame (the harness owns cadence;
  do not start the engine's own `requestAnimationFrame` loop).
- `teardown(): void` — release the scene and engine instance.
- `gpuDevice?(): GPUDevice | null` — optional; return the live `GPUDevice` when
  initialised on `'webgpu'` so the harness can attach its structural probe (a
  WebGL2 context is instead recovered from the canvas). Return `null` otherwise.

### Two configs (the tier-gap axis)

The convention is that a reference arm exposes **one adapter per config** so the
harness can separate two questions:

- an **`immediate`** config — the reference engine driven in an immediate-mode
  style comparable to ExoJS's current path, and
- a **`retained`** config — the reference engine's retained / dirty-tracking
  tier, if it has one.

Return both from `createReferenceAdapters()` (a two-element array). Comparing the
two against ExoJS is what answers the tier-gap question: does the `retained`
config flatten a scaling curve that `immediate` tracks alongside ExoJS? If the
engine has no genuinely separable immediate tier, return a single adapter and say
so — do not present a conflated number as a tier comparison.

### Cross-arm fairness contract (MANDATORY)

Both arms must render the _same_ scene and mutate the _same_ nodes, or the
comparison is meaningless. The ExoJS adapter (`exojs.ts`) follows these rules and
any reference adapter **must** follow them identically:

1. **Same node set.** Build exactly `nodeCount` leaves for the archetype, laid
   out and nested as `spec` describes (`nestingDepth`, `textureCount`,
   `cullingEnabled`, the `overdraw` stacking).
2. **Same mutation selection.** Seed a fresh RNG with
   `createRng(seed)` (from `../archetypes`) and draw **exactly one** `rng()`
   value **per leaf, in ascending leaf index order**, selecting the leaf for
   mutation when `rng() < spec.mutationFraction`. Draw the value for _every_
   leaf even when `mutationFraction` is `0`-effectively-skipped — the point is
   that both arms, seeded the same way and drawing in the same order, select the
   byte-for-byte identical set of node indices. Do not batch, reorder, or draw
   more than one value per leaf.
3. **Same per-frame work.** `mutate(frame)` must disturb only that selected set,
   with a displacement small enough to never cross the viewport edge (so culling
   never changes the visible set mid-run).
4. **Same cadence.** One `renderFrame()` produces one frame; let the harness time
   it. Do not run the engine's internal render loop.
