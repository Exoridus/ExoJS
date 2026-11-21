# ExoJS Examples

Framework-agnostic ExoJS example sources and shared assets.

## Layout

- `examples.json` — authoritative examples catalog used by the playground and guide pages
- `assets/` — shared runtime assets (`audio/`, `font/`, `image/`, `json/`, `svg/`, `video/`)
- `<chapter>/` - chapter-scoped TypeScript sources; the `.js` runtime file beside each is generated and Git-ignored
- `shared/` — shared runtime helper and editor typings for playground preview execution

## Contract

- This directory is treated as engine material, not site-framework material.
- The docs/playground app under `../site/` consumes these files, but this folder remains runnable as static content: run `pnpm examples:generate` once, then `npx serve examples`. The generated `.js` files are build output; edit the `.ts` source and regenerate.

## Catalog ordering & levels

- **Array order in `examples.json` is the curated display order** — the playground sidebar and every other consumer render categories in `CHAPTERS` order and the examples of a category exactly in array order. Order each category didactically (simple → complex), never alphabetically; new examples are inserted where they fit the learning arc, not appended.
- **Every example carries a `level`** (`intro` | `intermediate` | `advanced`). The playground badges `intro` and `advanced` in the sidebar; `intermediate` is the unbadged default.

## Complete guide workflows

`guides/` contains authored TypeScript programs embedded by `SourceSnippet` in the Guide. They are typechecked with the examples but are not separate Playground catalog entries and do not generate JavaScript siblings. Programs that import demo media use the public `@codexo/exojs-demo-assets` package alongside Core; no Playground runtime globals are required.

| Workflow                              | Authored source                                                          |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Sprite, named animation, and pause    | [sprite-animation.ts](guides/animation/sprite-animation.ts)              |
| Sprite, collider, and movement        | [sprite-movement.ts](guides/physics-basics/sprite-movement.ts)           |
| Character with Idle/Walk/Jump         | [animated-character.ts](guides/character-movement/animated-character.ts) |
| Button, text field, and shared submit | [name-form.ts](guides/ui-and-widgets/name-form.ts)                       |
| Preload, transition, and scene audio  | [scene-navigation.ts](guides/model-b-plus/scene-navigation.ts)           |
| Enemies, filters, and sensor cleanup  | [enemy-sensors.ts](guides/gameplay-collision/enemy-sensors.ts)           |
| Camera, parallax, and world picking   | [parallax.ts](guides/camera-follow-and-parallax/parallax.ts)             |
| System, web, and bitmap fonts         | [font-types.ts](guides/text/font-types.ts)                               |

Use the corresponding guide's ownership/readiness and input instructions when copying a program. Keep one application entry point per page, mount its canvas, and give it keyboard focus for keyboard recipes.
