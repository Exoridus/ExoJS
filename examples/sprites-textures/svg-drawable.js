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
    texture;
    sprite;
    async load(loader) {
        // rune-mark.svg carries only a viewBox (no width/height), so it would
        // rasterise to a 0x0 image. Request an explicit pixel size — the SVG is
        // vector, so it stays crisp scaled up to 256x256.
        await loader.load(SvgAsset, { mark: 'svg/rune-mark.svg' }, { width: 256, height: 256 });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.texture = new Texture(loader.get(SvgAsset, 'mark'));
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
