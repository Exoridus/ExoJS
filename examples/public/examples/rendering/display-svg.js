import { Application, Color, Scene, Texture, Sprite, SvgAsset } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new Scene({

    async load(loader) {
        await loader.load(SvgAsset, { tiger: 'svg/tiger.svg' });
    },
    init(loader) {
        const { width, height } = this.app.canvas;

        this._texture = new Texture(loader.get(SvgAsset, 'tiger'));

        this._tiger = new Sprite(this._texture);
        this._tiger.setAnchor(0.5);
        this._tiger.setPosition(width / 2 | 0, height / 2 | 0);
    },

    draw(backend) {
        backend.clear();
        this._tiger.render(backend);
    },
}));
