# Contributing to ExoJS

ExoJS is a TypeScript-first, pnpm-workspace monorepo. Core (`@codexo/exojs`) lives
at the repository root; official extensions and tooling live under `packages/`.

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
pnpm typecheck    pnpm lint:strict   pnpm test        pnpm build
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

## Distribution

- npm packages are **modular and self-contained**: `@codexo/exojs` ships Core only;
  `@codexo/exojs-particles` and `@codexo/exojs-tiled` ship only their own product.
  There is no Core `/full` export and no aggregator package.
- Packages ship `.js` + `.d.ts` + source maps — **never raw `.ts` runtime entries**.
  The `exports` map is the public interface; the bundler profile is the supported
  type-resolution target (browser/bundler-first).
- Extensions are side-effect-free at the root; `@codexo/<ext>/register` performs the
  explicit registration.
- The synchronized offline snapshot (npm tarballs + versioned ESM vendor trees +
  examples + built site) is the GitHub Full Release archive.
