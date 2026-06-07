// Auto-generated from svg-drawable.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, SvgAsset, Texture } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
document.body.append(app.canvas);
class SvgDrawableScene extends Scene {
    texture;
    sprite;
    async load(loader) {
        await loader.load(SvgAsset, { mark: 'svg/rune-mark.svg' });
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
