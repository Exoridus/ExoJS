# ADR 0001: Extension Package Architecture

**Status:** Accepted  
**Date:** 2026-06-04  
**Milestone:** 0.12

---

## Context

ExoJS 0.11.0 ships `@codexo/exojs` as a single Core Runtime Package with one
official subpath export:

```
@codexo/exojs          → src/index.ts  (application, scene, rendering, input, …)
@codexo/exojs/debug    → src/debug/index.ts  (DebugLayer, DebugOverlay, …)
```

PR #83 (_fix/docs-resync-guide-api_) began syncing guide documentation against
the current rendering API and introduced a guide import from
`@codexo/exojs/debug`. Before guides, starters and templates are built further
on top of this shape, the long-term package boundary needs to be decided.

The problem: if guides ship using `@codexo/exojs/debug`, that subpath becomes
a de-facto public API surface that's difficult to remove without breaking docs
and downstream users. Debug tooling is development-only; bundling it inside the
Core package increases production bundle size and couples unrelated versioning.

---

## Decision

### 1. Core Package stays as-is

`@codexo/exojs` remains the single Core Runtime Package. It contains:

- `Application`
- `Scene` and scene graph
- Rendering core (WebGL2 / WebGPU backends, Geometry, Material, RenderPass)
- `Sprite`, `Text` / `BitmapText`, `Graphics`
- Loader basics
- Input core
- Audio core (considered a Core USP for the foreseeable future)

### 2. Debug is extracted into a dedicated Extension Package

Target package name: **`@codexo/exojs-debug`**

This package will contain all development/inspection tooling:

- `DebugLayer`
- `DebugOverlay`
- `PerformanceLayer`
- `RenderPassInspectorLayer`
- `BoundingBoxesLayer`
- `HitTestLayer`
- `PointerStackLayer`
- Any future debug / inspector layers

The package will live under `packages/exojs-debug/` and declare
`@codexo/exojs` as a peer dependency.

### 3. `@codexo/exojs/debug` is a temporary compatibility subpath only

The existing `@codexo/exojs/debug` subpath export **must not** be treated as a
long-term public API surface. It must not be expanded, promoted in guides, or
referenced in starters. It will be deprecated once `@codexo/exojs-debug` is
published.

### 4. Particles and other areas require a prior audit

The following packages are _candidates_ for future extraction but are not
decided in this ADR:

| Candidate          | Target name                    | Prerequisite                    |
| ------------------ | ------------------------------ | ------------------------------- |
| Particle system    | `@codexo/exojs-particles`      | Dependency / API audit          |
| Asset pipeline     | `@codexo/exojs-assets`         | Usage survey                    |
| Audio FX / spatial | `@codexo/exojs-audio-fx`       | Decision on Audio core boundary |
| Post-processing    | `@codexo/exojs-postprocessing` | Design spec                     |

No code changes for these candidates in 0.12.

### 5. Guide, Starter and Template import conventions

All documentation, guide code blocks, starter templates and playground examples
must import from **official package names** (`@codexo/exojs`,
`@codexo/exojs-debug`, …), never from Core subpaths
(`@codexo/exojs/debug`, `@codexo/exojs/particles`, …).

---

## Consequences

### Positive

- Production bundles exclude debug tooling by default.
- Extension packages can be versioned and released independently.
- Docs clearly signal what is Core API vs. dev tooling.
- Guide typecheck infrastructure can map each package to its source root.

### Negative / Risks

- Existing users who already import `@codexo/exojs/debug` need a migration
  path (deprecation notice + one minor grace period).
- PR #83 (_fix/docs-resync-guide-api_) must not be merged as-is; it will be
  replaced by smaller, scoped PRs (see below).

---

## 0.12 Scope

What **is** in scope for 0.12:

- Extract `src/debug/**` into `packages/exojs-debug/` as a published package.
- Update `tsconfig.guides.json` paths to map `@codexo/exojs-debug`.
- Resync affected guide code blocks to import from `@codexo/exojs-debug`.
- Deprecate `@codexo/exojs/debug` subpath export (keep for one release cycle).
- Playground / Starter Onboarding (separate PRs, unblocked by this decision).

What **is not** in scope for 0.12:

- New engine features.
- Particles or any other package extraction (audit first).
- Removal of `@codexo/exojs/debug` subpath (deprecation only in 0.12;
  removal no earlier than 0.13).
- Monorepo tooling overhaul.

---

## Planned Follow-up PRs

These PRs replace PR #83 and implement the decision:

1. **Guide Typecheck Gate** — standalone CI gate for guide code blocks;
   maps `@codexo/exojs` paths, no debug import yet.
2. **Debug Extension Package** — extract `src/debug/` into
   `packages/exojs-debug/`, publish as `@codexo/exojs-debug`, deprecate
   `@codexo/exojs/debug` subpath.
3. **Guide API Resync** — resync all guide code blocks to final import shape
   (`@codexo/exojs` + `@codexo/exojs-debug`); close PR #83.

> **Note:** PR #83 (_fix/docs-resync-guide-api_) is not merged and not closed
> automatically. It will be superseded by the above PRs once the debug package
> lands.
