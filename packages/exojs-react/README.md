# @codexo/exojs-react

React 18 / 19 bindings for [ExoJS](https://exoridus.github.io/ExoJS/) - mount an ExoJS `Application` into your React tree, drive scenes declaratively, and overlay React HUD on the canvas.

## Installation

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-react react react-dom
```

`@codexo/exojs` and `react` (>= 18) are peer dependencies; `react-dom` is an optional peer. The package ships pre-built ESM (`dist/esm`) with type declarations and works on both `@types/react` 18 and 19.

## Two layers, pick what you need

This package is intentionally layered:

- **`useExoApplication` — headless.** Creates and owns the `Application`, binds it to a `<canvas>` you render yourself. No DOM, no wrapper, no styling opinions — full control.
- **`<ExoCanvas>` — batteries-included.** Renders a positioned wrapper `<div>` + a React-managed `<canvas>` and provides the app via context, so HUD overlays work out of the box.

## Quick start — `<ExoCanvas>`

The scene classes in `./scenes` are ordinary ExoJS scenes. Register their constructors in the application options; the React `<Scene>` declarations select from that registry rather than registering engine scenes themselves.

```tsx
import { Color, FadeSceneTransition, FixedResolutionCanvasSizing, Time } from '@codexo/exojs';
import { ExoCanvas, Scene, Scenes } from '@codexo/exojs-react';
import { useState } from 'react';

import { GameScene, TitleScene } from './scenes';

const options = {
  scenes: { TitleScene, GameScene },
  canvas: { width: 1280, height: 720, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
};
const transition = new FadeSceneTransition({ duration: Time.seconds(0.3) });

export function Game() {
  const [active, setActive] = useState('title');

  return (
    <ExoCanvas options={options} style={{ width: '100%', height: 480 }} onError={console.error}>
      <Scenes active={active} transition={transition}>
        <Scene name="title" component={TitleScene} />
        <Scene name="game" component={GameScene} />
      </Scenes>
      <nav aria-label="Game screens" style={{ position: 'absolute', top: 8, left: 8 }}>
        <button type="button" onClick={() => setActive('title')}>
          Title
        </button>
        <button type="button" onClick={() => setActive('game')}>
          Play
        </button>
      </nav>
    </ExoCanvas>
  );
}
```

The first activation starts the engine; the transition applies to subsequent scene switches. Scene-load failures reach `onError`. For a production application, replace the console handler with the error presentation your interface needs.

Layout props (`style`, `className`, and other div attributes) apply to the **wrapper**. Give it a non-zero size and let the `FixedResolutionCanvasSizing` policy fit the logical canvas inside it. Use `canvasProps` for canvas attributes, but do not override the dimensions or styles owned by a sizing policy.

### Headless hook: your own canvas

The hook owns the application and its teardown, but does not choose a scene. Start a registered scene in `onReady`:

```tsx
import { useExoApplication } from '@codexo/exojs-react';

import { GameScene } from './scenes';

const options = { scenes: { GameScene }, canvas: { width: 800, height: 600 } };

export function Game() {
  const { canvasRef } = useExoApplication(
    options,
    app => {
      void app.start(GameScene).catch(console.error);
    },
    console.error,
  );
  return <canvas ref={canvasRef} className="game-canvas" />;
}
```

These are alternative hosting patterns, not two components to mount for one application. Use `<ExoCanvas>` for context and React overlays; use the hook for direct control over the canvas element.

## API

| Export                                            | Kind       | Purpose                                                                                                  |
| ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `ExoCanvas`                                       | component  | Batteries-included canvas host (wrapper div + canvas + context). Accepts `onReady`/`onError`.            |
| `useExoApplication(options?, onReady?, onError?)` | hook       | Headless: owns the `Application`, returns `{ app, canvasRef }`. `onError` mirrors `Application.onError`. |
| `useExoApp()`                                     | hook       | The `Application` from the nearest `<ExoCanvas>`/provider. Throws if absent.                             |
| `useExoContext()`                                 | hook       | Like `useExoApp` but returns `Application \| null` (no throw).                                           |
| `ExoContext`                                      | context    | The underlying context (advanced / testing).                                                             |
| `useScene(SceneClass, deps?)`                     | hook       | Instantiate + activate a single scene; returns it once live. Load failures route to `app.onError`.       |
| `Scenes` / `Scene`                                | components | Declarative scene switch over the one-active-scene model. Load failures route to `app.onError`.          |
| `useActiveScene()`                                | hook       | The active scene instance from the nearest `<Scenes>`.                                                   |
| `useSignal(signal, getSnapshot)`                  | hook       | Subscribes to an engine `Signal` and re-renders on every dispatch (e.g. `app.onFrame`).                  |

### Reactivity model

The `Application` is recreated only when an **identity** option changes — the render `backend` (WebGL2 ↔ WebGPU cannot be hot-swapped). Other supported options are applied **live**:

- `canvas.width` / `canvas.height` → `app.resize(...)`
- `clearColor` → `app.clearColor`

Options without a live setter (`canvas.pixelRatio`, `seed`, `extensions`, …) are captured at creation; change the `backend` or remount to apply them.

`canvas.sizing` is captured at creation as well: a sizing policy is an object, so a fresh instance on every render would detach and re-attach the previous one each time. Assign `app.sizing` yourself to switch strategies at runtime.

## Learn more

- [React integration guide](https://exoridus.github.io/ExoJS/en/guide/integrations/react/)
- [Scene lifetimes and navigation](https://exoridus.github.io/ExoJS/en/guide/runtime/scenes-and-lifecycle/)

## License

MIT © Codexo
