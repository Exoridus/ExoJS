# Transform And Space Conventions

This document defines the expected local/global transform behavior for this codebase.

## Terms
- `local transform`: transform built from a node's own position/rotation/scale/origin.
- `global transform` (world): transform relative to root/canvas space after parent composition.
- `view/projection`: render-camera transforms owned by rendering/view systems.

## Current engine convention

### Composition direction
- In this engine, global composition is done by combining local with parent:
  - `global = local.combine(parentGlobal)`
- In code this is done in `SceneNode.getGlobalTransform()`.

### Parent traversal
- Parent transforms are updated first (`updateParentTransform()`), then child/global data is used.
- Bounds are derived from local bounds transformed by global transform.

### Point transformation
- Local to world:
  - `worldPoint = localPoint.transform(globalMatrix)`
- World to local:
  - `localPoint = worldPoint.transformInverse(globalMatrix)`
  - or use `globalMatrix.getInverse(...)` then `transform(...)`.

### Transform sources
- `SceneNode` owns position, rotation, scale, origin and caches transform values with internal dirty flags.
- `SceneNode.getGlobalTransform()` composes the local transform with the parent chain to produce world-space transforms.
- The transform fields and accessors live directly on `SceneNode`. There is no separate public `Transformable` class.

## Rules for new code
1. Do not mix composition order across modules.
2. Do not introduce alternative matrix layout assumptions.
3. Keep matrix usage consistent between rendering and collision/hit testing.
4. Use existing transform APIs instead of ad-hoc matrix math when possible.

## Coordinate-space guideline for shapes
- Target convention for polygon-like shapes:
  - `points` are local-space
  - shape `x/y` is world/local offset
- Any SAT/intersection code should apply this convention consistently.

## Known follow-up work
- Some polygon/collision paths still have local/world inconsistencies.
- Recommended sequence for full cleanup:
1. Normalize all polygon intersection/projection paths to one local/world convention.
2. Add regression tests for offset polygons against circle/rectangle/polygon/SAT cases.
3. Keep behavior consistent with `SceneNode` global transform semantics.
