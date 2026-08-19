# Contributing to ExoJS

ExoJS is a TypeScript-first, pnpm-workspace monorepo. Core (`@codexo/exojs`) lives
at the repository root; official extensions and tooling live under `packages/`.

## One-time clone setup

Run this once per clone:

```sh
git config pull.ff only
```

`main` only ever advances through a reviewed PR, so a local commit on `main`
cannot reach the remote — it just makes the branch diverge from `origin/main`.
On a diverged branch, Git's default `pull` silently builds a merge commit, and
that history has to be untangled by hand afterwards. `pull.ff only` turns the
diverged pull into a loud failure instead.

The other half of that guard — refusing commits on `main` in the first place —
ships with the repo as `.husky/pre-commit`, so it needs no setup. For a
deliberate exception such as a release version bump:

```sh
ALLOW_MAIN_COMMIT=1 git commit ...
```

Optional, but useful in a repo with many short-lived branches — prune
remote-tracking refs whose upstream is gone on every fetch:

```sh
git config fetch.prune true
```

## Shader tooling

The WGSL validation gate (`test/rendering/wgsl-naga-validation.test.ts`) shells
out to Naga, the WGSL front end of wgpu and therefore of Firefox's WebGPU. It
is the only gate that sees WGSL through anything but Tint — the Chromium WebGPU
lane is Dawn, and the Firefox WebGPU lane gets no adapter in CI. Naga is not an
npm dependency; install the pinned version once:

```sh
cargo install naga-cli --version 26.0.0 --locked
```

Without it every case in that spec skips, and `EXOJS_NAGA` points at an
existing binary if it is not on `PATH`. CI installs the same version and sets
`EXOJS_REQUIRE_NAGA=1`, which turns the absence into a failure.

For authoring, [wgsl-analyzer](https://github.com/wgsl-analyzer/wgsl-analyzer)
is worth having in the editor — it gives `.wgsl` files a language server rather
than syntax highlighting alone. It is a developer convenience, not a build
dependency: nothing in the repository invokes it, and CI does not install it.

## Import policy

Package-internal imports use Node `package.json#imports` subpath imports — never a
path alias, never a parent-relative path:

```ts
import { Bounds } from './Bounds'; // same directory only
import { Vector } from '#math/Vector'; // any other path in THIS package
import { Application } from '@codexo/exojs'; // another package (public entry)
import type { Extension } from '@codexo/exojs/extensions';
```

Forbidden: `../x`, `@/x`, bare `core/x`, `@codexo/exojs/src/x`. ESLint enforces this.

How it resolves: each package maps `#*` in its `package.json#imports` to a
package-specific source condition (`./src/*.ts`) and to `./dist/esm/*` for consumers.
tsc uses `customConditions`, Vitest uses `resolve`/`ssr.resolve.conditions`, and
Rollup uses node-resolve `exportConditions` — all pointing `#` at source in-repo. The
shipped `.d.ts` keep `#` verbatim and resolve through the package's own imports map,
so there is no declaration alias-rewrite step.

## Per-package commands

After one root `pnpm install`, every package builds, tests and packs on its own:

```bash
pnpm --filter @codexo/exojs build        # or -particles / -tiled
pnpm --filter @codexo/exojs-particles test
pnpm --filter @codexo/exojs-tiled pack
# …or from the package directory:
pnpm build && pnpm test && pnpm pack
```

Root scripts orchestrate the repository:

```bash
pnpm typecheck    pnpm lint:all      pnpm test        pnpm build
pnpm format:check pnpm verify:exports pnpm verify:package-policy
pnpm verify:lockstep  pnpm typecheck:examples  pnpm typecheck:guides
pnpm site:build   pnpm test:examples:smoke
```

## Shared configuration

`@codexo/exojs-config` (private, unpublished, never a runtime dependency) centralizes
reusable tooling — TypeScript profiles (`extends`-able JSON), Prettier, ESLint
import-boundary presets, Vitest project factories, the Rollup extension factory, and
the package-policy verifier. It is consumed with no build step. Repository-specific
concerns (browser WebGL2/WebGPU test projects, ESLint globs, release assembly) stay in
the Root, not in the config package.

## Examples and assets

Example authors use the injected, typed `assets` global directly — no import:

```ts
assets.demo.textures.bunny;
```

The global is installed only inside the controlled example runtimes (Playground,
Example/Guide preview, Asset Browser, smoke harness, Full Release harness). It is not
part of the engine public API. The canonical catalog is `examples/assets/assets.ts`;
`pnpm --filter @codexo/exojs-examples examples:sync` regenerates the `.js` sources and
the runtime catalog.

## Compile-time build constants

Three synthetic identifiers (denoted by the `__*__` convention) are statically
replaced at build time by every Rollup/Vite/Vitest configuration in the
repository:

| Constant       | Type      | Purpose                                                    |
| -------------- | --------- | ---------------------------------------------------------- |
| `__DEV__`      | `boolean` | Compile-time diagnostic mode (`true` in dev/test/source)   |
| `__VERSION__`  | `string`  | Current package version (per-package, from `package.json`) |
| `__REVISION__` | `string`  | Short source revision; `-dirty` means local changes        |

These are **not** application configuration. Normal application environments
should use `import.meta.env` or their own configuration mechanism.

The canonical ambient declaration lives in `src/build-constants.d.ts` and is
included by every tsconfig in the repository. The build-defines helper
(`@codexo/exojs-config/build-defines`) centralises resolution and serialisation.

Release metadata (full revision SHA, creation date, tarball hashes) belongs in
`release-manifest.json`. Do not use `.env` as the canonical source of the
package version or official revision.

See `src/core/BuildInfo.ts` for the public runtime API (`buildInfo`).

## Immutability: `readonly` first, `Object.freeze` only where it earns it

Express immutability in the type. `readonly` and `readonly T[]` cost nothing at
runtime and catch the mistake at the call site, which is where it is cheapest to
fix. Reach for `Object.freeze` only when the type cannot carry the guarantee.

Two cases justify it:

- **A shared cached snapshot.** `Container.children` hands the same array to
  every reader until the next structural change, so a stray `push` from one
  caller would corrupt what all the others see — including the engine's own
  paint-order pass. The type alone cannot stop a JavaScript caller, and the
  freeze happens once per structural change, not per frame.
- **Engine-owned values copied from caller input**, where a later mutation of
  the caller's object must not reach into engine state (see
  `TextureRegion`'s extrusion insets).

Everywhere else, prefer `readonly` in the type and, if a runtime check is worth
having, gate the freeze on `__DEV__` — the pattern `TextureRegion` uses on its
own instances. Production then pays nothing while development still fails loudly.

Never freeze per-frame: `RenderPlanPlayer` deliberately skips a per-draw
`Object.freeze` for exactly this reason, and that decision should stay the norm
for anything on the playback path.

For a field a subclass may read but must not mutate, neither is needed — make
the field private and expose a `readonly` getter, as `Container` does for its
child list.

## Enums: string when the value is a name, numeric when the value is a number

A public enum member's value is part of the API — it shows up in a debugger, in
serialized documents and in a log line. Pick the representation from what the
value actually _is_:

- **String enum** for a closed set of names the engine chose itself:
  `SceneState.Active = 'active'`, `TextureFormat.Rgba8 = 'rgba8'`,
  `ApplicationState.Running = 'running'`. These read correctly everywhere
  without a lookup table, survive a round trip through JSON, and cost nothing
  the engine cares about — none of them sits in a per-frame comparison that a
  string would measurably slow down.
- **Numeric enum only when the number carries meaning of its own.** Three cases
  qualify, and each one is documented at the declaration:
  - the value _is_ a platform constant — `ScaleModes.Nearest = 0x2600` and
    `WrapModes.Repeat = 0x2901` are WebGL2 `GLenum`s passed straight to the
    driver;
  - the value is a bitfield member — `SpriteFlags`, `ViewFlags`,
    `PointerStateFlag`, `ChannelSize`/`ChannelOffset`, all of which are
    combined with `|` and tested with `&`;
  - the value is written into a GPU buffer — `PixelSnapMode` is packed into a
    `Float32Array` row and read by both shader families, so its numbering is a
    wire format, not a label.
- **Ordering** is a fourth, narrower case: `SystemOrder` and `LogSeverity` are
  numeric because callers compare and interpolate them (`order: -450`,
  `severity >= Warning`).

`const enum` stays reserved for hot internal discriminators that never cross the
package boundary (`RenderEntryKind`, `ClipKind`, `CollisionType`).

Prefer a plain string union over an enum when there is no need to reference the
members as values — `CanvasSizingMode` is a union, not an enum, because callers
only ever write the literal.

## Distribution

- npm packages are **modular and self-contained**: `@codexo/exojs` ships Core only;
  `@codexo/exojs-particles` and `@codexo/exojs-tiled` ship only their own product.
  There is no Core `/full` export and no aggregator package.
- Packages ship `.js` + `.d.ts` + source maps — **never raw `.ts` runtime entries**.
  The `exports` map is the public interface; the bundler profile is the supported
  type-resolution target (browser/bundler-first).
- Extensions are side-effect-free at the root; pass their descriptor to
  `ApplicationOptions.extensions` to equip an app. There is no global registry.
- The synchronized offline snapshot (npm tarballs + versioned ESM vendor trees +
  examples + built site) is the GitHub Full Release archive.
