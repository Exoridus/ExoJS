# @codexo/exojs-bench

Private, reproducible cross-library rendering/physics benchmark harness for ExoJS.
Not published. Compares ExoJS against competitor libraries (Pixi, Phaser,
Excalibur, matter-js, rapier2d-compat) kept in an isolated `competitors/`
manifest — see `competitors/package.json` and `competitors/link.mjs` for why
they're excluded from the workspace install.

## Setup

```sh
pnpm --filter @codexo/exojs-bench bench:setup   # installs + links the competitor libs (one-time, ~235MB)
pnpm --filter @codexo/exojs-bench bench         # runs the benchmark
```

## Why this package is out of required CI

`bench:setup` runs `pnpm install --dir competitors --ignore-workspace`. That
`--ignore-workspace` install:

- resolves a **separate lockfile** outside `pnpm-workspace.yaml`, so it
  bypasses the root workspace's `minimumReleaseAge` supply-chain quarantine
  (see `pnpm-workspace.yaml`) — a version bump here needs a manual release-age
  sanity check instead of the automatic gate everything else gets;
- pulls in ~235MB of competitor libraries that a normal contributor should
  never have to download just to typecheck their own PR.

Running that inside the shared-CI trust boundary (a required, always-on gate)
would mean every contributor's PR — and the shared CI runners — install and
trust third-party libraries whose only purpose is being compared against, not
shipped. So `@codexo/exojs-bench` is deliberately excluded from
`typecheck:packages` / `verify:quick` / CI. A standalone `typecheck:bench`
root script exists for on-demand/manual runs:

```sh
pnpm typecheck:bench   # bench:setup + typecheck, in one step
```

## Local backstop: the pre-push hook

`.husky/pre-push` runs a **path-gated, local-only** check on branch pushes:

- it fires **only** when the commits being pushed touch
  `packages/exojs-bench/**` — zero cost for every other push;
- if the competitor deps are already linked locally (i.e.
  `packages/exojs-bench/node_modules/pixi.js` exists from a prior
  `bench:setup`), it runs `pnpm --filter @codexo/exojs-bench typecheck` and
  **fails the push** on a type error;
- if they aren't linked, it prints a warning telling you to run `bench:setup`
  and **skips without failing** — an optional, uninstalled dependency should
  never block an unrelated push.

## Known gap

This is a local, path-gated backstop, not a CI gate — it only runs on the
machine that pushes a bench-touching commit, and only if that machine has
already run `bench:setup`. An **engine API change under `src/`** that breaks
the bench adapters' types, without a commit that also touches
`packages/exojs-bench/**`, is **not** caught by this hook (or by CI). This is
an accepted trade-off to keep the bench package's ~235MB of competitor
dependencies out of the shared-CI trust boundary entirely. A future
self-hosted-GPU bench tier (see the engine's perf-tracking roadmap) is the
right place to run a full, unconditional `typecheck:bench` as a real backstop.
