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
    private texture!: Texture;
    private sprite!: Sprite;

    override async load(loader): Promise<void> {
        // The exo.js wordmark SVG carries only a viewBox (no width/height), so
        // it would rasterise to a 0x0 image. Request an explicit pixel size —
        // the SVG is vector, so it stays crisp at any rasterised resolution.
        await loader.load(SvgAsset, { mark: 'svg/exo-wordmark.svg' }, { width: 850, height: 324 });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.texture = new Texture(loader.get(SvgAsset, 'mark'));

        this.sprite = new Sprite(this.texture);
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition((width / 2) | 0, (height / 2) | 0);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new SvgDrawableScene());
