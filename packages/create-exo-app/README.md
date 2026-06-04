# create-exo-app

Official starter for [ExoJS](https://github.com/Exoridus/ExoJS).

## Usage

```bash
npm create exo-app@latest my-game
```

Or pick a template:

```bash
npm create exo-app@latest my-game -- --template minimal
npm create exo-app@latest my-game -- --template game-starter
npm create exo-app@latest my-game -- --template audio-reactive
```

Then:

```bash
cd my-game
npm install
npm run dev
```

## Templates

| Template | Description |
|---|---|
| `minimal` | Smallest TypeScript ExoJS app — one `Scene`, one rotating box |
| `game-starter` | Keyboard-controlled player, `GameScene` + `GameOverScene`, score HUD |
| `audio-reactive` | `AudioAnalyser`-driven frequency bar visualiser; click-to-start gesture |

## CLI options

```
create-exo-app <project-name> [--template <name>] [--force]

  --template  minimal | game-starter | audio-reactive  (default: minimal)
  --force     overwrite an existing non-empty directory
```

When run interactively (TTY) without `--template`, the CLI prompts for a template choice.  
In non-TTY / CI environments it defaults to `minimal` automatically.

## License

MIT
