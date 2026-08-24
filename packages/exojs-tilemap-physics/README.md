# @codexo/exojs-tilemap-physics

Static physics colliders from ExoJS tilemap collision geometry.

> A peer-dependency library on top of `@codexo/exojs`, `@codexo/exojs-tilemap`
> and `@codexo/exojs-physics` — construct its API directly. Importing it
> registers nothing.

`@codexo/exojs-tilemap` never imports physics and `@codexo/exojs-physics` never
imports tilemap; this package is the seam between them, so both stay usable on
their own.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-tilemap @codexo/exojs-physics @codexo/exojs-tilemap-physics
```

## Tile layers

`TileColliderStreamer` keeps a physics world's static tile colliders in sync
with a `TileLayer`: one static body per chunk-sized partition of the layer,
rebuilt when that partition is edited, destroyed when its chunk is evicted.

```ts
import { PhysicsWorld } from '@codexo/exojs-physics';
import { TileColliderStreamer } from '@codexo/exojs-tilemap-physics';

const world = new PhysicsWorld({ gravity: { x: 0, y: 1600 } });
const colliders = new TileColliderStreamer(world, groundLayer);

scene.systems.add({
  update: (delta) => {
    colliders.sync();
    world.step(delta.seconds);
  },
});
```

`sync()` is cheap to call every frame: with no change since the last call it
returns immediately and does no work. It observes the layer through its public
revision counters, so it works with `ChunkStreamer`, a hand-rolled loader, or a
bounded layer that is fully resident.

Call `destroy()` to remove every body the bridge created. Bodies it did not
create are untouched.

## Collision authored per cell

Some editors author collision per grid cell rather than per tile - LDtk's
`IntGrid` is the common case. Pass a `cells` source and the bridge covers the
whole bounded layer, including partitions that hold no tiles at all:

```ts
import { createLdtkIntGridCellSource } from '@codexo/exojs-ldtk';

const colliders = new TileColliderStreamer(world, collisionLayer, {
  cells: createLdtkIntGridCellSource(collisionLayer),
  material: ({ type }) => (type === 'Water' ? { isSensor: true } : null),
});
```

A cell source is a plain `(tx, ty) => string | null`, so a procedural or
hand-rolled grid works the same way. The returned string is a classification,
never a meaning: it is the merge key for adjacent cells and it is what the
`material` resolver sees. Nothing in this package knows what `Solid` or `Water`
are supposed to do.

The source is sampled while a partition is built and is expected to answer
identically for the lifetime of the bridge. Changing what it returns does not
invalidate colliders that already exist - rebuild by recreating the bridge.

## Object layers

An object layer is static data with no residency, so it gets a one-shot build:

```ts
import { buildObjectLayerColliders } from '@codexo/exojs-tilemap-physics';

const built = buildObjectLayerColliders(world, triggersLayer, {
  isSensor: true,
});

for (const { object, body } of built) {
  // `object` is the source object: name, type, custom properties.
}
```

## Geometry mapping

| Source | Collider |
|---|---|
| Merged whole-cell region (`regionMode: 'boxes'`) | one box per merged rectangle |
| Merged whole-cell region (`regionMode: 'outline'`) | one closed chain per boundary loop |
| Rectangle | box |
| Ellipse | capsule along the major axis, or a circle when round |
| Convex polygon | one polygon |
| Concave polygon | several convex polygons on the same body |
| Polyline | open chain; closed chain when its endpoints coincide |
| Point | nothing |

An ellipse maps to the capsule with the minor semi-axis as its radius and the
difference of the semi-axes as its spine. That capsule contains the ellipse and
is contained in the circumscribed circle, so it covers the source without a
tuning constant, and degenerates to a circle when the ellipse is round.

## Region modes

`regionMode: 'boxes'` (the default) keeps merged rectangles as solid boxes. The
region has an interior, so point queries, overlaps and sensors behave, and a
body that starts inside solid tiles is pushed out. Where the merge cannot merge
— neighbouring cells with different collision semantics, staircase profiles,
partial cells — adjacent boxes share an internal edge that a body sliding across
can catch on.

`regionMode: 'outline'` traces the boundary of each solid region into closed
one-sided chains, which have no internal edges at all. It removes intra-chunk
seams between adjacent cells that resolve to the same collision semantics;
boundaries between regions with different resolved semantics remain separate, as
do chunk boundaries. The trade-off is that a chain is a boundary, not an area:
queries inside the region find nothing, and a body spawned inside it falls
through.

## Materials

Friction, restitution, density, the sensor flag and the collision filter are
call-level defaults, optionally overridden per object:

```ts
new TileColliderStreamer(world, groundLayer, {
  friction: 0.8,
  material: ({ type }) => (type === 'ice' ? { friction: 0.02 } : null),
});
```

The resolver is a build-time mapping, not a live rule: it runs only while a
chunk is being built or rebuilt. Changing what it would return has no effect
until the layer itself changes. An unrecognised `type` is not an error — it
reaches the resolver like any other and falls back to the defaults.

In `outline` mode the resolved material also decides what may share a boundary:
cells whose colliders would be indistinguishable are traced into one chain, and
cells that resolve differently keep their own.

## Things to know before shipping a level

- **Merging never crosses a chunk boundary.** A solid run spanning two chunks is
  at least two rectangles. That is what makes the result independent of the
  order chunks were loaded in.
- **A dynamic body resting on an evicted chunk falls.** Eviction is the chunk
  source's decision; widen its unload radius if that matters.
- **Order is stable, part counts are not.** For a given layer and resident chunk
  set the colliders are identical regardless of load order, and `bodies()`
  iterates in `(cy, cx)` chunk order. The number of convex parts a concave
  polygon decomposes into, and the exact rectangle decomposition of a merged
  region, are not contractual.

## Core compatibility

| `@codexo/exojs-tilemap-physics` | `@codexo/exojs` |
|---|---|
| 0.15.x | 0.15.x |

## License

MIT © Codexo
