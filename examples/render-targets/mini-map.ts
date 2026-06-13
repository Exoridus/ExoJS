import { Application, CallbackRenderPass, Color, Graphics, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite } from '@codexo/exojs';

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

class MiniMapScene extends Scene {
    private world!: Graphics;
    private player!: Graphics;
    private miniRt!: RenderTexture;
    private miniSprite!: Sprite;
    private miniFrame!: Graphics;
    private pipeline!: RenderPipeline;
    private time = 0;

    override init(): void {
        const { width } = this.app.canvas;
        const miniX = width - 220 - 20;
        const miniY = 20;

        this.world = new Graphics();
        this.player = new Graphics();
        this.miniRt = new RenderTexture(220, 160);
        this.miniSprite = new Sprite(this.miniRt).setPosition(miniX, miniY);
        this.miniFrame = new Graphics();
        this.miniFrame.lineWidth = 2;
        this.miniFrame.lineColor = Color.white;
        this.miniFrame.drawRectangle(miniX, miniY, 220, 160);

        // The "world" is immediate-mode (grid + player) — a context-aware callback, drawn once
        // into the minimap texture and once to the screen. The sprite + frame are scene nodes.
        this.pipeline = new RenderPipeline()
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        context.backend.clear();
                        this.renderWorld(context.backend);
                    },
                    { target: this.miniRt },
                ),
            )
            .addPass(
                new CallbackRenderPass((context) => {
                    context.backend.clear();
                    this.renderWorld(context.backend);
                }),
            )
            .addPass(new RenderNodePass(this.miniSprite))
            .addPass(new RenderNodePass(this.miniFrame));
    }

    override update(delta): void {
        this.time += delta.seconds;
    }

    private renderWorld(backend): void {
        const { width, height } = this.app.canvas;
        const marginX = 80;
        const marginY = 60;

        this.world.clear();
        this.world.lineWidth = 2;
        this.world.lineColor = new Color(60, 70, 90);
        for (let x = marginX; x <= width - marginX; x += 80) this.world.drawLine(x, marginY, x, height - marginY);
        for (let y = marginY; y <= height - marginY; y += 80) this.world.drawLine(marginX, y, width - marginX, y);
        this.world.render(backend);

        const x = width / 2 + Math.cos(this.time) * (width * 0.4);
        const y = height / 2 + Math.sin(this.time * 1.3) * (height * 0.4);
        this.player.clear();
        this.player.fillColor = new Color(255, 180, 100);
        this.player.drawCircle(x, y, 18);
        this.player.render(backend);
    }

    override draw(context): void {
        this.pipeline.execute(context);
    }

    override destroy(): void {
        // Pipeline cascades destroy() to its passes; the caller-owned minimap target is freed here.
        this.pipeline.destroy();
        this.miniRt.destroy();
        super.destroy();
    }
}

app.start(new MiniMapScene());
