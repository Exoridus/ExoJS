// Auto-generated from texture-loader.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Sprite, Text, Texture } from '@codexo/exojs';
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
class TextureLoaderScene extends Scene {
    _sprites;
    _bar;
    _label;
    _width = 0;
    _progress = { loaded: 0, total: 3 };
    async load(loader) {
        const loading = loader.load(Texture, {
            bunny: 'image/ship-a.png',
            gradient: 'image/hue-ramp.png',
            uvGrid: 'image/uv-grid-256.png',
        });
        loading.onProgress.add((progress) => {
            this._progress = progress;
        });
        await loading;
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        const textures = [loader.get(Texture, 'bunny'), loader.get(Texture, 'gradient'), loader.get(Texture, 'uvGrid')];
        this._sprites = textures.map((texture, index) => {
            const sprite = new Sprite(texture);
            sprite.setAnchor(0.5);
            sprite.setPosition(200 + index * 200, height * 0.55);
            return sprite;
        });
        this._bar = new Graphics();
        this._label = new Text('', { fillColor: Color.white, fontSize: 18 });
        this._label.setPosition(300, 190);
        this._width = width;
    }
    draw(context) {
        context.backend.clear();
        const { loaded, total } = this._progress;
        this._bar.clear();
        this._bar.fillColor = new Color(60, 60, 60);
        this._bar.drawRectangle(200, 150, 400, 24);
        this._bar.fillColor = new Color(90, 220, 120);
        this._bar.drawRectangle(200, 150, total > 0 ? (400 * loaded) / total : 0, 24);
        context.render(this._bar);
        this._label.text = `Loaded ${loaded} / ${total}`;
        context.render(this._label);
        for (const sprite of this._sprites) {
            context.render(sprite);
        }
    }
}
app.start(new TextureLoaderScene());
