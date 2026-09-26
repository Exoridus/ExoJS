# create-exo-app

Create an ExoJS application with Vite, TypeScript, and a working scene. Use `minimal` to learn the runtime before adding optional systems.

```sh
npm create exo-app@latest my-game -- --template minimal
cd my-game
npm install
npm run dev
```

Omit `--template` to choose interactively. The generated project belongs to you: edit its source, commit its lockfile, and keep compatible ExoJS package versions pinned.

## Templates

| Template         | Starting point                                                                 |
| ---------------- | ------------------------------------------------------------------------------ |
| `minimal`        | One visible animated object in one scene.                                      |
| `game-starter`   | Keyboard-controlled gameplay and a game-over scene.                            |
| `platformer`     | Side-scrolling physics, camera follow, and jump handling.                      |
| `top-down`       | Tilemaps, collision, and click-to-move pathfinding; procedural or Tiled input. |
| `ui-app`         | A settings interface built from Core UI widgets.                               |
| `audio-reactive` | Shapes driven by live audio analysis.                                          |

Availability follows the scaffolder version you run. The repository's `next` branch can contain a template that is not yet in an older npm release. A specialized template includes more systems; it is not a prerequisite for using the engine.

## Locate the application code

`src/main.ts` creates the application, registers scene classes, mounts the canvas, and awaits startup. Scene behavior lives in `src/scenes/`. Files under `public/assets/` are served unchanged; `public/` is not part of their request URL.

```sh
npm run build
npm run preview
```

The build writes the static application to `dist/`. Preview checks that output locally; verify the actual hosted output as well, especially loader base paths and optional browser capabilities.

## Documentation

[Setup and project layout](https://exoridus.github.io/ExoJS/en/guide/getting-started/setup/) · [Your first scene](https://exoridus.github.io/ExoJS/en/guide/getting-started/your-first-scene/) · [Build and deploy](https://exoridus.github.io/ExoJS/en/guide/shipping/deployment/)

## License

MIT
