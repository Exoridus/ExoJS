# @codexo/exojs-react

React 18 / 19 bindings for [ExoJS](https://exojs.dev) — mount an ExoJS
`Application` into your React tree, drive scenes declaratively, and overlay React
HUD on the canvas.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-react react
```

`@codexo/exojs` and `react` (>= 18) are peer dependencies; `react-dom` is an
optional peer. The package ships pre-built ESM (`dist/esm`) with type
declarations and works on both `@types/react` 18 and 19.

## Two layers, pick what you need

This package is intentionally layered:

- **`useExoApplication` — headless.** Creates and owns the `Application`, binds
  it to a `<canvas>` you render yourself. No DOM, no wrapper, no styling
  opinions — full control.
- **`<ExoCanvas>` — batteries-included.** Renders a positioned wrapper `<div>` +
  a React-managed `<canvas>` and provides the app via context, so HUD overlays
  work out of the box.

## Quick start — `<ExoCanvas>`

```tsx
import { ExoCanvas, Scenes, Scene, useExoApp } from '@codexo/exojs-react';
import { TitleScene, GameScene } from './scenes';

function Game() {
  return (
    <ExoCanvas
      options={{ canvas: { width: 1280, height: 720 }, clearColor: someColor }}
      style={{ width: 1280, height: 720 }}
    >
      <Scenes active="game" transition={{ type: 'fade', duration: 0.3 }}>
        <Scene name="title" component={TitleScene} />
        <Scene name="game" component={GameScene}>
          <Hud /> {/* absolutely-positioned React overlay, over the canvas */}
        </Scene>
      </Scenes>
    </ExoCanvas>
  );
}

function Hud() {
  const app = useExoApp();
  return <div style={{ position: 'absolute', top: 8, left: 8 }}>FPS overlay…</div>;
}
```

Layout props (`style`, `className`, …) apply to the **wrapper**; size it to
drive `'fill'`/`'letterbox'` sizing. Style the canvas itself via `canvasProps`.

## Quick start — headless hook (full control)

```tsx
import { useExoApplication } from '@codexo/exojs-react';

function Game() {
  const { app, canvasRef } = useExoApplication({ canvas: { width: 800, height: 600 } });
  // Render the canvas however and wherever you want.
  return <canvas ref={canvasRef} className="my-canvas" />;
}
```

## API

| Export | Kind | Purpose |
|---|---|---|
| `ExoCanvas` | component | Batteries-included canvas host (wrapper div + canvas + context). |
| `useExoApplication(options?, onReady?)` | hook | Headless: owns the `Application`, returns `{ app, canvasRef }`. |
| `useExoApp()` | hook | The `Application` from the nearest `<ExoCanvas>`/provider. Throws if absent. |
| `useExoContext()` | hook | Like `useExoApp` but returns `Application \| null` (no throw). |
| `ExoContext` | context | The underlying context (advanced / testing). |
| `useScene(SceneClass, deps?)` | hook | Instantiate + activate a single scene; returns it once live. |
| `Scenes` / `Scene` | components | Declarative scene switch over the one-active-scene model. |
| `useActiveScene()` | hook | The active scene instance from the nearest `<Scenes>`. |

### Reactivity model

The `Application` is recreated only when an **identity** option changes — the
render `backend` (WebGL2 ↔ WebGPU cannot be hot-swapped). Other supported options
are applied **live**:

- `canvas.width` / `canvas.height` → `app.resize(...)`
- `canvas.sizingMode` → `app.sizingMode`
- `clearColor` → `app.clearColor`

Options without a live setter (`canvas.pixelRatio`, `seed`, `extensions`, …) are
captured at creation; change the `backend` or remount to apply them.

## License

MIT © Codexo
