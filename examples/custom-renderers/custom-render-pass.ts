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
    private back!: Sprite;
    private front!: Sprite;
    private between!: Graphics;
    private angle = 0;
    private pass!: CallbackRenderPass;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.back = new Sprite(loader.get(Texture, 'bunny'))
            .setAnchor(0.5)
            .setPosition(280, 300)
            .setScale(2.2)
            .setTint(new Color(120, 170, 255));
        this.front = new Sprite(loader.get(Texture, 'bunny'))
            .setAnchor(0.5)
            .setPosition(520, 300)
            .setScale(2.2)
            .setTint(new Color(255, 180, 120));
        this.between = new Graphics();
        this.pass = new CallbackRenderPass(backend => {
            this.between.clear();
            this.between.lineWidth = 10;
            this.between.lineColor = new Color(130, 240, 170);
            this.between.drawArc(400, 300, 120, this.angle, this.angle + Math.PI * 1.3);
            this.between.render(backend);
        });
    }

    override update(delta): void {
        this.angle += delta.seconds * 2.2;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.back);
        context.backend.execute(this.pass);
        context.render(this.front);
    }
}

app.start(new CustomRenderPassScene());
