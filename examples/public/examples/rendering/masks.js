import { Application, Color, Graphics, Rectangle, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        const bunny = loader.get(Texture, 'bunny');

        // Rectangle mask — GPU scissor, O(1) cost.
        this._rectSprite = new Sprite(bunny);
        this._rectSprite.setScale(5);
        this._rectSprite.setPosition(width / 4 | 0, height / 2 | 0);
        this._rectSprite.setAnchor(0.5);
        this._rectMask = new Rectangle(0, 0, 110, 110);
        this._rectSprite.mask = this._rectMask;

        // Graphics mask — RenderNode alpha composite.
        const circle = new Graphics();
        circle.fillColor = Color.white;
        circle.drawCircle(0, 0, 72);

        this._gfxSprite = new Sprite(bunny);
        this._gfxSprite.setScale(5);
        this._gfxSprite.setPosition((width * 3 / 4) | 0, height / 2 | 0);
        this._gfxSprite.setAnchor(0.5);
        this._gfxSprite.mask = circle;

        this._time = 0;
    }
    update(delta) {
        const { width, height } = this.app.canvas;
        this._time += delta.seconds;

        const r = 80;
        this._rectMask.x = (width / 4 + Math.cos(this._time * 1.4) * r - 55) | 0;
        this._rectMask.y = (height / 2 + Math.sin(this._time * 1.4) * r - 55) | 0;
    }
    draw(backend) {
        backend.clear();
        this._rectSprite.render(backend);
        this._gfxSprite.render(backend);
    }
});
