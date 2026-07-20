// Auto-generated from svg-drawable.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Scene, Sprite, Texture } from '@codexo/exojs';
class SvgDrawableScene extends Scene {
    texture;
    sprite;
    async init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        // SvgAsset has no seamless adapter (unlike Texture/Sound), so it is
        // awaited via `load()` rather than fetched synchronously via `get()`.
        // The exo.js wordmark SVG carries only a viewBox (no width/height), so
        // it would rasterise to a 0x0 image. Request an explicit pixel size —
        // the SVG is vector, so it stays crisp at any rasterised resolution.
        //
        // The cast below works around a pre-existing overload-resolution gap:
        // every value-asset dispatch token (Json/TextAsset/SvgAsset/…) is an
        // empty marker class, so they're structurally identical to `load()`'s
        // `typeof Json` overload — which is declared first and wins, typing
        // the result as `unknown` instead of `HTMLImageElement`. See the
        // flagged deviation in the migration report.
        const mark = (await this.loader.load(Asset.kind('svg', 'svg/exo-wordmark.svg', { width: 850, height: 324 })));
        this.texture = new Texture(mark);
        this.sprite = new Sprite(this.texture);
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition((width / 2) | 0, (height / 2) | 0);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
const app = new Application({
    scenes: { SvgDrawableScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
app.start(SvgDrawableScene);
