# Platformer template

Side-scrolling starter wired to `@codexo/exojs-physics`: a dynamic player body,
static level geometry, camera follow, and the two timing rules that make a jump
feel right.

## Where things are

- `src/scenes/PlatformerScene.ts` — level layout, the physics world, and the camera.
- `src/objects/Player.ts` — movement, jumping, and the ground check.
- `public/assets/` — the sprite atlases.

## Art

The sprite atlases are from Kenney's _New Platformer Pack_, released under
CC0. `public/assets/ART-LICENSE.txt` is the pack's own licence file. You can
replace or delete the art without any attribution obligation.
