# Top-down template

Tilemap, physics and click-to-move pathfinding, wired together. The same level
is available two ways, so you can see what each map format costs you before
committing to one.

## Two scenes, one level

- `ProceduralMapScene` builds the map in code from `src/level.ts`. Right when
  the layout is decided at runtime.
- `TiledMapScene` loads the same layout from `public/assets/town-square.tmj`.
  Right when a designer edits the level.

`main.ts` starts the procedural one. Delete whichever you do not need — nothing
else in the template depends on the choice.

Both extend `TopDownScene`, which owns everything that does not vary: the
physics world, the wall colliders, the navigation grid, the pathfinder, the
camera and the HUD. That split is the point. Pathfinding and physics never read
the tilemap; they read a grid of costs and a set of bodies. Swapping the map
format changes what you look at and nothing about how the actor moves.

## Editing the level

`src/level.ts` is the source of truth for the procedural scene, the navigation
grid and the wall colliders. `town-square.tmj` was generated from it, so
changing one without the other makes the two scenes disagree.

To change the layout:

- **procedural only** — edit `LEVEL` in `src/level.ts` and you are done;
- **both** — edit `LEVEL`, then redraw `town-square.tmj` in
  [Tiled](https://www.mapeditor.org/) to match, or drop `TiledMapScene`.

The map's `Walls` layer uses a placeholder tile from the atlas. Open the map in
Tiled and pick something that suits your game — the layout is what the scene
reads, not the tile id.

## Art

The tile atlas is from Kenney's _Map Pack_ and the character sheet from the
_New Platformer Pack_, both released under CC0. `public/assets/ART-LICENSE.txt`
is the pack's own licence file. You can replace or delete the art without any
attribution obligation.
