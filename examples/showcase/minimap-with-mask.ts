import { Application, CallbackRenderPass, Color, Graphics, type RenderingContext, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, type Time } from '@codexo/exojs';



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
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width } = app.canvas;

        // Park the round minimap in the top-right corner of the 16:9 canvas.
        const miniSize = 260;
        const miniX = width - miniSize - 20;
        const miniY = 20;
        const centerX = miniX + miniSize / 2;
        const centerY = miniY + miniSize / 2;
        const radius = 120;

        this.world = new Graphics();
        this.player = new Graphics();
        this.rt = new RenderTexture(miniSize, miniSize);
        this.mini = new Sprite(this.rt).setPosition(miniX, miniY).setScale(1);
        this.mask = new Graphics();
        this.mask.fillColor = Color.white;
        this.mask.drawCircle(centerX, centerY, radius);
        this.mini.mask = this.mask;
        this.frame = new Graphics();
        this.frame.lineWidth = 3;
        this.frame.lineColor = Color.white;
        this.frame.drawCircle(centerX, centerY, radius);

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

    override update(delta: Time): void {
        this.time += delta.seconds;
    }

    private drawWorld(backend: RenderingContext['backend']): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const marginX = 80;
        const marginY = 60;
        const right = width - marginX;
        const bottom = height - marginY;

        this.world.clear();
        this.world.lineWidth = 2;
        this.world.lineColor = new Color(60, 70, 90);
        for (let x = marginX; x <= right; x += 80) this.world.drawLine(x, marginY, x, bottom);
        for (let y = marginY; y <= bottom; y += 80) this.world.drawLine(marginX, y, right, y);
        this.world.render(backend);
        this.player.clear();
        this.player.fillColor = new Color(255, 170, 110);
        this.player.drawCircle(
            width / 2 + Math.cos(this.time) * (width * 0.36),
            height / 2 + Math.sin(this.time * 1.2) * (height * 0.32),
            18,
        );
        this.player.render(backend);
    }

    override draw(context: RenderingContext): void {
        this.pipeline.execute(context);
    }

    override destroy(): void {
        // Pipeline cascades destroy() to its passes; the caller-owned minimap target is freed here.
        this.pipeline.destroy();
        this.rt.destroy();
        super.destroy();
    }
}

const app = new Application({
    scenes: { MinimapWithMaskScene },
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

app.start(MinimapWithMaskScene);
