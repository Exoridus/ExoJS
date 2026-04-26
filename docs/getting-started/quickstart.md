# Quickstart

This guide takes you from zero to a running ExoJS scene.

## 1. Install

```bash
npm install exojs
```

## 2. Create a Canvas

```html
<canvas id="app"></canvas>
```

## 3. Create a Scene and Start the App

```ts
import { Application, Scene, Graphics, Color, type SceneRenderRuntime } from 'exojs';

class HelloScene extends Scene {
    private readonly spinner = new Graphics();

    public constructor() {
        super();

        this.spinner.fillColor = Color.white;
        this.spinner.drawRectangle(-32, -32, 64, 64);
        this.spinner.setPosition(400, 300);

        this.addChild(this.spinner);
    }

    public override update(delta: import('exojs').Time): void {
        this.spinner.rotation += delta.seconds * 45;
    }

    public override draw(runtime: SceneRenderRuntime): void {
        this.root.render(runtime);
    }
}

const canvas = document.querySelector<HTMLCanvasElement>('#app');

if (!canvas) {
    throw new Error('Missing #app canvas');
}

const app = new Application({
    canvas,
    width: 800,
    height: 600,
    clearColor: Color.cornflowerBlue,
});

await app.start(new HelloScene());
```

## 4. Load Assets (Bundle Workflow)

```ts
import { defineAssetManifest, Texture } from 'exojs';

const manifest = defineAssetManifest({
    bundles: {
        boot: [
            { type: Texture, alias: 'logo', path: 'ui/logo.png' },
        ],
    },
});

app.loader.registerManifest(manifest);
await app.loader.loadBundle('boot');

const logo = app.loader.get(Texture, 'logo');
```

## 5. Next Steps

- [Core Concepts](../core-concepts/overview.md)
- [Assets and bundles](../assets/loader-and-bundles.md)
- [Scene stacking](../scenes/scene-flow.md)
