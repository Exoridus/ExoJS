# Top-down template

A map that drives the game: the walls and the door you see are the walls and the door that block the player, both for its physics body and for its click-to-move pathfinding. The player walks by click or with WASD, and `E` opens and closes the door it stands next to.

## Two scenes, one level

- `TiledMapScene` loads `public/assets/town-square.tmj`. Right when a designer edits the level in [Tiled](https://www.mapeditor.org/).
- `ProceduralMapScene` builds the same map in code from `src/level.ts`. Right when the layout is decided at runtime.

`main.ts` starts the Tiled one. Delete whichever you do not need — nothing else depends on the choice.

Both extend `TopDownScene`, which reads everything from the map it is given:

- **Walls.** A tile of the `Walls` layer whose tileset definition has a collision shape is solid. `TileColliderStreamer` (from `@codexo/exojs-tilemap-physics`) turns those shapes into static physics bodies; `TileNavigationSpace` (from `@codexo/exojs-pathfinding`) routes around the same cells. In Tiled, a tile's collision is drawn in the tileset's _Tile Collision Editor_.
- **Doors.** A `Walls` tile with a `door` property is a door. Opening it removes the tile, closing it puts it back; both the colliders and the routes follow the edit. A door does not close on any physics body that reaches into the doorway.
- **Spawn.** The `spawn` point of the `Markers` object layer.

The actor is a kinematic circle: `KinematicMovementComponent` moves it without passing through walls, and `NavigationAgentComponent` steers it along a route. `src/actor.ts` sizes the route to the actor, so an actor wider than a tile is kept out of one-tile gaps instead of planning a path its body cannot walk. A click walks the actor to the middle of the clicked tile (for a wide actor, the middle of the nearest free square of tiles it fits in) rather than to the exact pixel, because a spot beside a wall is one its body cannot reach. A click on a wall, or on a tile no route of the actor's width leads to, ends as unreachable.

## When things update

Physics and navigation read the same layer but at different moments, and the scene is explicit about both:

- the collider bridge syncs before each frame's fixed steps, and again right after a door edit, so no physics step runs against a stale wall;
- the navigation space resamples when an agent next reads it. A walking agent notices a door edit and replans within its repath interval; until then the synced collider is what stops it at a door that just closed.

The door key is read from the action's `tick` view inside `fixedUpdate`, so one press toggles the door once however many fixed steps the frame runs. Clicks are ignored while the scene is paused or suspended, so nothing is queued for later.

## Editing the level

`town-square.tmj` is the source of truth for `TiledMapScene`. `src/level.ts` describes the same layout for `ProceduralMapScene`; change one without the other and the two scenes disagree.

- **Tiled only** — edit the map; collision and navigation follow it with no code change.
- **both** — edit `LEVEL` in `src/level.ts` and redraw `town-square.tmj` to match, or drop `ProceduralMapScene`.

The `Walls` and door tiles are placeholders from the atlas. Pick tiles that suit your game, and give the solid ones a collision shape.

## Art

The tile atlas is from Kenney's _Map Pack_ and the character sheet from the _New Platformer Pack_, both released under CC0. `public/assets/ART-LICENSE.txt` is the pack's own licence file. You can replace or delete the art without any attribution obligation.
