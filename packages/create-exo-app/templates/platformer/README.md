# Platformer template

Side-scrolling starter wired to `@codexo/exojs-physics`: a dynamic player body, static level geometry, camera follow, and the two timing rules that make a jump feel right.

## Where things are

- `src/scenes/PlatformerScene.ts` — level layout, the physics world, and the camera.
- `src/objects/Player.ts` — movement, jumping, and the ground check.
- `public/assets/` — the sprite atlases.

## Timing

The physics world is a scene system built with `fixedDelta: this.app.fixedTimeStep`, so the application's fixed step drives it and it stays correct if you change `fixedTimeStep`. The player is advanced from the scene's `fixedUpdate`, right before the world steps, so a jump reaches the same height whatever the display's refresh rate.

Controls are an `ActionMap`: running reads the held `move` axis, and jumping reads `controls.jump.tick.pressed`, which hands each press to exactly one fixed step even when a frame runs no step or several. The player body never sleeps, because a sleeping body ignores velocity written onto it.

## Art

The sprite atlases are from Kenney's _New Platformer Pack_, released under CC0. `public/assets/ART-LICENSE.txt` is the pack's own licence file. You can replace or delete the art without any attribution obligation.
