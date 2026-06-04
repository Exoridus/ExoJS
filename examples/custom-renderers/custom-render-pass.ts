import { Application, CallbackRenderPass, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';

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

class CustomRenderPassScene extends Scene {
    private _back!: Sprite;
    private _front!: Sprite;
    private _between!: Graphics;
    private _angle = 0;
    private _pass!: CallbackRenderPass;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._back = new Sprite(loader.get(Texture, 'bunny'))
            .setAnchor(0.5)
            .setPosition(280, 300)
            .setScale(2.2)
            .setTint(new Color(120, 170, 255));
        this._front = new Sprite(loader.get(Texture, 'bunny'))
            .setAnchor(0.5)
            .setPosition(520, 300)
            .setScale(2.2)
            .setTint(new Color(255, 180, 120));
        this._between = new Graphics();
        this._pass = new CallbackRenderPass(backend => {
            this._between.clear();
            this._between.lineWidth = 10;
            this._between.lineColor = new Color(130, 240, 170);
            this._between.drawArc(400, 300, 120, this._angle, this._angle + Math.PI * 1.3);
            this._between.render(backend);
        });
    }

    override update(delta): void {
        this._angle += delta.seconds * 2.2;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._back);
        context.backend.execute(this._pass);
        context.render(this._front);
    }
}

app.start(new CustomRenderPassScene());
