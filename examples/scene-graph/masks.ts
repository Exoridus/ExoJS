import { technical } from '@assets';
import { Application, Color, Graphics, Rectangle, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const ALPHA_RINGS = technical.alpha.alphaGradientRings;

class MasksScene extends Scene {
    private _rectSprite!: Sprite;
    private _rectMask!: Rectangle;
    private _gfxSprite!: Sprite;
    private _time = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { alphaRings: ALPHA_RINGS });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;
        const tex = loader.get(Texture, 'alphaRings');

        this._rectSprite = new Sprite(tex);
        this._rectSprite.setScale(1);
        this._rectSprite.setPosition((width / 4) | 0, (height / 2) | 0);
        this._rectSprite.setAnchor(0.5);
        this._rectMask = new Rectangle(0, 0, 110, 110);
        this._rectSprite.mask = this._rectMask;

        const circle = new Graphics();
        circle.fillColor = Color.white;
        circle.drawCircle(0, 0, 72);

        this._gfxSprite = new Sprite(tex);
        this._gfxSprite.setScale(1);
        this._gfxSprite.setPosition(((width * 3) / 4) | 0, (height / 2) | 0);
        this._gfxSprite.setAnchor(0.5);
        this._gfxSprite.mask = circle;
    }

    override update(delta): void {
        const { width, height } = this.app.canvas;
        this._time += delta.seconds;

        const r = 80;
        this._rectMask.x = (width / 4 + Math.cos(this._time * 1.4) * r - 55) | 0;
        this._rectMask.y = (height / 2 + Math.sin(this._time * 1.4) * r - 55) | 0;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._rectSprite);
        context.render(this._gfxSprite);
    }
}

app.start(new MasksScene());
