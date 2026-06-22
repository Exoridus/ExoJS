# 0001 — Shared geometry, separate collision detection

- **Status:** Accepted
- **Date:** 2026-06-22
- **Context tags:** v0.14, physics, math/geometry

## Context

ExoJS currently has **two** collision-related systems, and a recurring instinct
is to "DRY them up" into one:

1. **Core SAT** (`src/math/`: `Circle`/`Polygon`/`Ellipse`/`Segment`,
   `collision-detection.ts`, `Collision.ts`). Mutable, position-bearing,
   `Vector[]` geometry with a full SAT `collidesWith`/`intersectsWith` response.
   It produces a single **minimum translation vector (MTV)** and runs in
   _immediate mode_ — answer "do A and B overlap, and by how much" right now.
   It backs gameplay overlap checks (`sprite.collidesWith(enemy)`) and feeds the
   core picking path (`SceneNode.contains`, broad-phase AABB via `Quadtree`).

2. **Physics narrow-phase** (`@codexo/exojs-physics`: `CircleShape`/
   `PolygonShape`/`BoxShape`, `collision/narrowphase.ts`, `Manifold.ts`).
   Immutable, position-less, flat `number[]`, mass-oriented geometry. It produces
   a **`Manifold`** — contact _points_ with feature IDs — consumed by the
   sequential-impulse solver, including warm-start across steps. It runs in
   _retained mode_ inside a `PhysicsWorld`.

The v0.14 `00-refactor-spec` (D4) initially proposed unifying these into "one
collision system". The subsequent top-down API review (`01-api-ux-review.md`
§8) found that to be the wrong goal.

## Decision

**Keep the two collision systems separate. Share geometry concepts where it is
cheap and layering-safe; do NOT share detection.**

- **Detection stays split.** Core SAT (one MTV, immediate-mode) and the physics
  narrow-phase (`Manifold` with contact points + feature IDs for solver
  warm-start) solve different problems with **incompatible output** (MTV vs.
  multi-point manifold) and **incompatible allocation models** (transient
  scratch vs. retained, pooled, feature-keyed contacts). Forcing one to produce
  the other's shape would regress both.
- **Geometry may be shared, narrowly.** The two shape families can converge on
  shared primitive concepts over time, but this is an optimisation, not a
  correctness requirement, and must never make physics a prerequisite of the
  core.
- **Layering is the hard constraint.** The core must work whenever it is used;
  `@codexo/exojs-physics` is an optional peer dependency. Picking and bounds
  (`Rectangle`, `contains`, `getBounds`, `Quadtree`) therefore stay in the core
  and never reach into physics. (Rotated-sprite picking was fixed core-locally
  via an oriented-box test in `SceneNode.contains`, with **no** physics
  dependency — see `01` §1.)

## Consequences

- The geometry "duplication" between `src/math/` and
  `packages/exojs-physics/src/shapes/` is **intentional and documented**, not a
  DRY debt to be paid down. This ADR exists so it is not re-litigated each audit.
- `Rectangle` stays distinct from `BoxShape` (AABB top-left vs. centred,
  rotatable box). `Ellipse`/`Line`/`Segment` stay core-only (physics has no
  equivalent; an ellipse degrades to a polygon approximation for collision).
- Users get a clear mental split: **core SAT** for gameplay overlap and picking
  (no physics needed); **the physics package** for simulation (forces, impulses,
  contacts). The "Core collision vs. physics package: when to use which" docs
  page should cross-link both.
- If strict de-duplication of the _geometry primitives_ (not detection) is ever
  pursued, it is an internal, layering-preserving refactor that lifts shared
  immutable primitives into the core for physics to import — never the reverse,
  and never merging the detection systems.

## Alternatives considered

- **One unified collision system (original D4).** Rejected: incompatible output
  and allocation models; would couple the optional physics package into the
  core picking path and invert layering.
- **Re-export the physics stateless collision as a core convenience.** Rejected:
  would make "physics is optional" untrue at the type level.
