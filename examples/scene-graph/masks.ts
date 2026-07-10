import { Application, Color, Graphics, Rectangle, Scene, Sprite } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

const ALPHA_RINGS = assets.technical.alpha.alphaGradientRings;

class MasksScene extends Scene {
    private rectSprite!: Sprite;
    private rectMask!: Rectangle;
    private gfxSprite!: Sprite;
    private time = 0;

    override init(): void {
        const { width, height } = this.app.canvas;
        const tex = this.loader.get(ALPHA_RINGS);

        this.rectSprite = new Sprite(tex);
        this.rectSprite.setScale(1);
        this.rectSprite.setPosition((width / 4) | 0, (height / 2) | 0);
        this.rectSprite.setAnchor(0.5);
        this.rectMask = new Rectangle(0, 0, 110, 110);
        this.rectSprite.mask = this.rectMask;

        const circle = new Graphics();
        circle.fillColor = Color.white;
        circle.drawCircle(0, 0, 72);

        this.gfxSprite = new Sprite(tex);
        this.gfxSprite.setScale(1);
        this.gfxSprite.setPosition(((width * 3) / 4) | 0, (height / 2) | 0);
        this.gfxSprite.setAnchor(0.5);
        this.gfxSprite.mask = circle;
    }

    override update(delta): void {
        const { width, height } = this.app.canvas;
        this.time += delta.seconds;

        const r = 80;
        this.rectMask.x = (width / 4 + Math.cos(this.time * 1.4) * r - 55) | 0;
        this.rectMask.y = (height / 2 + Math.sin(this.time * 1.4) * r - 55) | 0;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.rectSprite);
        context.render(this.gfxSprite);
    }
}

app.start(new MasksScene());
