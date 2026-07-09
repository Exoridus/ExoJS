// Auto-generated from svg-drawable.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, SvgAsset, Texture } from '@codexo/exojs';
const app = new Application({
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
class SvgDrawableScene extends Scene {
    image;
    texture;
    sprite;
    async load(loader) {
        // The exo.js wordmark SVG carries only a viewBox (no width/height), so
        // it would rasterise to a 0x0 image. Request an explicit pixel size —
        // the SVG is vector, so it stays crisp at any rasterised resolution.
        // NOTE: SvgAsset.of() does not accept a `{ width, height }` presize option
        // (unlike FontAsset.of()'s `family`), so the old token record-form load()
        // is retained here for the sizing option; the alias-lookup get() call is
        // dropped in favour of holding the handle directly from load()'s return.
        const { mark } = await loader.load(SvgAsset, { mark: 'svg/exo-wordmark.svg' }, { width: 850, height: 324 });
        this.image = mark;
    }
    init() {
        const { width, height } = this.app.canvas;
        this.texture = new Texture(this.image);
        this.sprite = new Sprite(this.texture);
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition((width / 2) | 0, (height / 2) | 0);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new SvgDrawableScene());
