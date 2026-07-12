# Rendering benchmark adapters

Each file here is one **arm** of the rendering benchmark: an object implementing
the neutral `EngineAdapter` contract (see `../EngineAdapter.ts`) that the harness
drives identically. The committed arms are:

- **`exojs.ts`** — the ExoJS engine, exposed as two configs: `current` (the
  default per-frame path) and `retained` (the RetainedContainer instruction
  set). Always present.
- **`pixi.ts`** — Pixi.js v8, the direct renderer comparison and the only other
  2D library that ships WebGPU. An **official, committed arm**: `pixi.js` is a
  pinned exact devDependency (no `^`/`~`) of `@codexo/exojs-bench`, and its
  version + resolution path are stamped into every report header.
- **`phaser.ts`** — Phaser 3.90, WebGL2-only in this harness (it runs under the
  `webgl2` backend request but Phaser 3 has **no WebGL2 renderer**, so it renders
  **WebGL1** — disclosed in every Phaser cell's `note` and the report
  Methodology). The WebGL2 structural probe cannot attach to a WebGL1 context, so
  the Phaser arm reports no draw-call counters (omitted, never faked); its CPU
  time is measured identically to the other arms. Committed pinned devDependency.
- **`excalibur.ts`** — Excalibur 0.32, a real WebGL2 arm (structural probe + GPU
  timer attach exactly as for the ExoJS/Pixi WebGL2 arms). Committed pinned
  devDependency.

Arms are registered in `../page/harness.ts` (`resolveAdapter`) and included in
the driver's cell matrix (`../driver.ts` `ADAPTER_CAPABILITIES`), with each
competitor's version stamped into the report header via `readLibraryProvenance`.
Each competitor module is imported lazily on first use, so an ExoJS-only run
never loads one and a competitor left unlinked fails only its own cells.

> The former gitignored `reference.local.ts` slot (a local-only, never-committed
> reference arm) has been **retired**: the comparison is now openly reproducible
> — anyone can `pnpm --filter @codexo/exojs-bench bench` and re-derive the
> numbers against the exact pinned competitor build, which is what makes an
> "ExoJS vs X" statement auditable rather than unverifiable.

## Adding a new committed arm

To add another library (e.g. Phaser, Excalibur, Konva — a separate follow-on,
gated on confirming the arm set):

1. Add the library as a **pinned exact-version** devDependency of
   `@codexo/exojs-bench` (never a `^`/`~` range, never vendored source).
2. Add an `adapters/<lib>.ts` exporting a `create<Lib>Adapter()` factory that
   implements the `EngineAdapter` contract and follows the fairness rules below.
3. Register it in `resolveAdapter` (harness) and, if the driver should schedule
   its cells, in `ADAPTER_CAPABILITIES` and `readLibraryProvenance` (driver).

It runs **in the browser page**, not in the Node driver, so it may freely use
`document`, WebGL2/WebGPU and the library's browser runtime.

### The `EngineAdapter` contract

Every arm implements (full JSDoc in `../EngineAdapter.ts`):

- `engine: string` — arm label, e.g. `'pixi'`. Reported verbatim.
- `config: string` — configuration label, e.g. `'current'` / `'retained'` /
  `'default'`.
- `supports(backend): boolean` — `true` for each backend (`'webgl2'` /
  `'webgpu'`) this arm can run. Unsupported backends are skipped, not failed.
- `init(canvas, backend): Promise<void>` — create the engine against the given
  canvas and backend. Pin the backend explicitly; never auto-select, and refuse
  a silent fallback to a different backend.
- `buildScene(spec, nodeCount, seed): void` — build the scene for the archetype
  (see fairness rules below).
- `mutate(frame): void` — apply the archetype's per-frame mutation.
- `renderFrame(): void` — render exactly one frame (the harness owns cadence;
  do not start the engine's own `requestAnimationFrame` loop).
- `teardown(): void` — release the scene and engine instance. The harness owns
  the `#stage` canvas and gives each cell a fresh one, so never detach it from
  the DOM (e.g. Pixi's `destroy` is called with `removeView: false`).
- `gpuDevice?(): GPUDevice | null` — optional; return the live `GPUDevice` when
  initialised on `'webgpu'` so the harness can attach its structural probe (a
  WebGL2 context is instead recovered from the canvas). Return `null` otherwise.
  (Pixi exposes it as `renderer.gpu.device`.) If an arm genuinely cannot surface
  the device, the harness degrades gracefully — it keeps timing and skips the
  structural counters for that cell rather than failing the run.
- `mutationSignature?(): string` — optional but **strongly recommended**; return
  `mutationSignature(selectedIndices)` (from `../../shared/mutation.ts`) for the
  set your most recent `buildScene` selected. The harness asserts it against the
  canonical selection and **fails the run loudly** if it diverges, so the
  cross-arm comparison rests on a check rather than prose (review B3). An arm
  that omits it runs, but prints a warning that its determinism is unverified.

### Cross-arm fairness contract (MANDATORY)

Every arm must render the _same_ scene and mutate the _same_ nodes, or the
comparison is meaningless. `exojs.ts` follows these rules and any new adapter
**must** follow them identically (`pixi.ts` is a faithful transcription):

1. **Same node set.** Build exactly `nodeCount` leaves for the archetype, laid
   out and nested as `spec` describes (`nestingDepth`, `textureCount`,
   `cullingEnabled`, the `overdraw` stacking). `cullingEnabled` is currently
   `false` on every archetype (review C4): ExoJS's `.cullable` drives a real
   per-node bounds check in the render walk, but Pixi's `.cullable` is inert
   unless the app registers `CullerPlugin` — an identically-set flag does NOT
   cost the same on both arms. A new adapter that wants culling on must give
   Pixi (or whichever arm is inert) an equivalent culling mechanism first, or
   the comparison is asymmetric again.
2. **Same mutation selection.** Use `selectMutationIndices(nodeCount,
   spec.mutationFraction, seed)` (from `../../shared/mutation.ts`) — the shared,
   canonical selection — to pick the leaves you mutate, and expose the result
   through `mutationSignature()`. The helper seeds a fresh `createRng(seed)` and
   draws **exactly one** `rng()` value **per leaf, in ascending index order**,
   selecting the leaf when `rng() < mutationFraction` (drawing for _every_ leaf
   even when the fraction is `0`). Both arms, sharing this one code path,
   therefore select the byte-for-byte identical index set, and the harness
   verifies it. Do not re-implement the draw loop, batch, reorder, or draw more
   than one value per leaf.
3. **Same per-frame work.** `mutate(frame)` must disturb only that selected set,
   with a displacement small enough to never cross the viewport edge (so culling
   never changes the visible set mid-run).
4. **Same cadence.** One `renderFrame()` produces one frame; let the harness time
   it. Do not run the engine's internal render loop.
