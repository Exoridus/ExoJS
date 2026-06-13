import { Application, Color, Graphics, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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

class TextureLoaderScene extends Scene {
    private sprites!: Sprite[];
    private bar!: Graphics;
    private label!: Text;
    private barX = 0;
    private barY = 0;
    private barWidth = 0;
    private progress = { loaded: 0, total: 3 };

    override async load(loader): Promise<void> {
        const loading = loader.load(Texture, {
            bunny:    'image/ship-a.png',
            gradient: 'image/hue-ramp.png',
            uvGrid:   'image/uv-grid-256.png',
        });

        loading.onProgress.add((progress) => {
            this.progress = progress;
        });

        await loading;
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;
        const textures = [loader.get(Texture, 'bunny'), loader.get(Texture, 'gradient'), loader.get(Texture, 'uvGrid')];

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

    override draw(context): void {
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
