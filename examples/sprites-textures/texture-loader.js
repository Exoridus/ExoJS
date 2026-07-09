// Auto-generated from texture-loader.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Sprite, Text } from '@codexo/exojs';
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
const PATHS = ['image/ship-a.png', 'image/hue-ramp.png', 'image/uv-grid-256.png'];
class TextureLoaderScene extends Scene {
    sprites;
    bar;
    label;
    barX = 0;
    barY = 0;
    barWidth = 0;
    progress = { loaded: 0, total: PATHS.length };
    async load(loader) {
        let loaded = 0;
        await Promise.all(PATHS.map(path => loader.load(path).then(() => {
            loaded++;
            this.progress = { loaded, total: PATHS.length };
        })));
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        const textures = PATHS.map(path => loader.get(path));
        // Spread the three textures evenly across the width, one per third.
        this.sprites = textures.map((texture, index) => {
            const sprite = new Sprite(texture);
            sprite.setAnchor(0.5);
            sprite.setPosition((width / textures.length) * (index + 0.5), height * 0.6);
            return sprite;
        });
        // Centered progress bar in the upper third.
        this.barWidth = width * 0.5;
        this.barX = (width - this.barWidth) / 2;
        this.barY = height * 0.22;
        this.bar = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 20, align: 'center' });
        this.label.setAnchor(0.5, 0);
        this.label.setPosition(width / 2, this.barY + 40);
    }
    draw(context) {
        context.backend.clear();
        const { loaded, total } = this.progress;
        this.bar.clear();
        this.bar.fillColor = new Color(60, 60, 60);
        this.bar.drawRectangle(this.barX, this.barY, this.barWidth, 24);
        this.bar.fillColor = new Color(90, 220, 120);
        this.bar.drawRectangle(this.barX, this.barY, total > 0 ? (this.barWidth * loaded) / total : 0, 24);
        context.render(this.bar);
        this.label.text = `Loaded ${loaded} / ${total}`;
        context.render(this.label);
        for (const sprite of this.sprites) {
            context.render(sprite);
        }
    }
}
app.start(new TextureLoaderScene());
