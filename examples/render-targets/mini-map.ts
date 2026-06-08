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

class MiniMapScene extends Scene {
    private world!: Graphics;
    private player!: Graphics;
    private miniRt!: RenderTexture;
    private miniSprite!: Sprite;
    private miniFrame!: Graphics;
    private pipeline!: RenderPipeline;
    private time = 0;

    override init(): void {
        this.world = new Graphics();
        this.player = new Graphics();
        this.miniRt = new RenderTexture(220, 160);
        this.miniSprite = new Sprite(this.miniRt).setPosition(560, 20);
        this.miniFrame = new Graphics();
        this.miniFrame.lineWidth = 2;
        this.miniFrame.lineColor = Color.white;
        this.miniFrame.drawRectangle(560, 20, 220, 160);

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
        this.world.clear();
        this.world.lineWidth = 2;
        this.world.lineColor = new Color(60, 70, 90);
        for (let x = 80; x <= 720; x += 80) this.world.drawLine(x, 60, x, 540);
        for (let y = 60; y <= 540; y += 80) this.world.drawLine(80, y, 720, y);
        this.world.render(backend);

        const x = 400 + Math.cos(this.time) * 250;
        const y = 300 + Math.sin(this.time * 1.3) * 180;
        this.player.clear();
        this.player.fillColor = new Color(255, 180, 100);
        this.player.drawCircle(x, y, 18);
        this.player.render(backend);
    }

    override draw(context): void {
        this.pipeline.execute(context);
    }
}

app.start(new MiniMapScene());
