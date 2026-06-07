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
    sprites;
    bar;
    label;
    width = 0;
    progress = { loaded: 0, total: 3 };
    async load(loader) {
        const loading = loader.load(Texture, {
            bunny: 'image/ship-a.png',
            gradient: 'image/hue-ramp.png',
            uvGrid: 'image/uv-grid-256.png',
        });
        loading.onProgress.add((progress) => {
            this.progress = progress;
        });
        await loading;
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        const textures = [loader.get(Texture, 'bunny'), loader.get(Texture, 'gradient'), loader.get(Texture, 'uvGrid')];
        this.sprites = textures.map((texture, index) => {
            const sprite = new Sprite(texture);
            sprite.setAnchor(0.5);
            sprite.setPosition(200 + index * 200, height * 0.55);
            return sprite;
        });
        this.bar = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 18 });
        this.label.setPosition(300, 190);
        this.width = width;
    }
    draw(context) {
        context.backend.clear();
        const { loaded, total } = this.progress;
        this.bar.clear();
        this.bar.fillColor = new Color(60, 60, 60);
        this.bar.drawRectangle(200, 150, 400, 24);
        this.bar.fillColor = new Color(90, 220, 120);
        this.bar.drawRectangle(200, 150, total > 0 ? (400 * loaded) / total : 0, 24);
        context.render(this.bar);
        this.label.text = `Loaded ${loaded} / ${total}`;
        context.render(this.label);
        for (const sprite of this.sprites) {
            context.render(sprite);
        }
    }
}
app.start(new TextureLoaderScene());
