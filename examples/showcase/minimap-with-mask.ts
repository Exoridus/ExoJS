import { Application, CallbackRenderPass, Color, Graphics, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite } from '@codexo/exojs';

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

class MinimapWithMaskScene extends Scene {
    private world!: Graphics;
    private player!: Graphics;
    private rt!: RenderTexture;
    private mini!: Sprite;
    private mask!: Graphics;
    private frame!: Graphics;
    private pipeline!: RenderPipeline;
    private time = 0;

    override init(): void {
        this.world = new Graphics();
        this.player = new Graphics();
        this.rt = new RenderTexture(260, 260);
        this.mini = new Sprite(this.rt).setPosition(530, 20).setScale(1);
        this.mask = new Graphics();
        this.mask.fillColor = Color.white;
        this.mask.drawCircle(660, 150, 120);
        this.mini.mask = this.mask;
        this.frame = new Graphics();
        this.frame.lineWidth = 3;
        this.frame.lineColor = Color.white;
        this.frame.drawCircle(660, 150, 120);

        this.pipeline = new RenderPipeline()
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        context.backend.clear();
                        this.drawWorld(context.backend);
                    },
                    { target: this.rt },
                ),
            )
            .addPass(
                new CallbackRenderPass((context) => {
                    context.backend.clear();
                    this.drawWorld(context.backend);
                }),
            )
            .addPass(new RenderNodePass(this.mini))
            .addPass(new RenderNodePass(this.frame));
    }

    override update(delta): void {
        this.time += delta.seconds;
    }

    private drawWorld(backend): void {
        this.world.clear();
        this.world.lineWidth = 2;
        this.world.lineColor = new Color(60, 70, 90);
        for (let x = 80; x <= 720; x += 80) this.world.drawLine(x, 60, x, 540);
        for (let y = 60; y <= 540; y += 80) this.world.drawLine(80, y, 720, y);
        this.world.render(backend);
        this.player.clear();
        this.player.fillColor = new Color(255, 170, 110);
        this.player.drawCircle(400 + Math.cos(this.time) * 230, 300 + Math.sin(this.time * 1.2) * 170, 18);
        this.player.render(backend);
    }

    override draw(context): void {
        this.pipeline.execute(context);
    }

    override destroy(): void {
        // Pipeline cascades destroy() to its passes; the caller-owned minimap target is freed here.
        this.pipeline.destroy();
        this.rt.destroy();
        super.destroy();
    }
}

app.start(new MinimapWithMaskScene());
