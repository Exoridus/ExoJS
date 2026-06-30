import { Application, Color, Container, Graphics, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, View } from '@codexo/exojs';

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
    private worldContainer!: Container;
    private world!: Graphics;
    private player!: Graphics;
    private miniRt!: RenderTexture;
    private miniSprite!: Sprite;
    private miniFrame!: Graphics;
    private overlay!: Container;
    private miniView!: View;
    private pipeline!: RenderPipeline;
    private time = 0;

    override init(): void {
        const { width, height } = this.app.canvas;
        const miniX = width - 220 - 20;
        const miniY = 20;

        // Grid + player live in one container so the same subtree can be drawn at
        // full size to the canvas and shrunk into the minimap texture.
        this.worldContainer = new Container();
        this.world = new Graphics();
        this.player = new Graphics();
        this.worldContainer.addChild(this.world);
        this.worldContainer.addChild(this.player);

        this.miniRt = new RenderTexture(220, 160);
        this.miniSprite = new Sprite(this.miniRt).setPosition(miniX, miniY);
        this.miniFrame = new Graphics();
        this.miniFrame.lineWidth = 2;
        this.miniFrame.lineColor = Color.white;
        this.miniFrame.drawRectangle(miniX, miniY, 220, 160);

        // Sprite + frame composited in one pass; draw order is now independent (RT sampling is order-safe).
        this.overlay = new Container();
        this.overlay.addChild(this.miniSprite);
        this.overlay.addChild(this.miniFrame);

        // A dedicated view that frames the whole world, scaled down into the
        // 220×160 minimap texture so the entire grid stays visible.
        this.miniView = new View(width / 2, height / 2, width, height);

        // Every stage is a RenderNodePass so the off-screen target redirect and
        // its clear stay inside the pass machinery — mixing in a manual
        // `context.backend.clear()` (immediate-mode) here leaks the off-screen
        // pass's clear onto the canvas and leaves the texture empty.
        this.pipeline = new RenderPipeline()
            .addPass(new RenderNodePass(this.worldContainer, { target: this.miniRt, view: this.miniView, clear: Color.black }))
            .addPass(new RenderNodePass(this.worldContainer, { clear: Color.black }))
            .addPass(new RenderNodePass(this.overlay));
    }

    override update(delta): void {
        const { width, height } = this.app.canvas;
        const marginX = 80;
        const marginY = 60;

        this.time += delta.seconds;

        this.world.clear();
        // Filled play-area: gives the minimap a recognizable region. Sub-pixel grid
        // lines alone vanish when the world is shrunk into the 220×160 texture.
        this.world.fillColor = new Color(50, 90, 160);
        this.world.drawRectangle(marginX, marginY, width - 2 * marginX, height - 2 * marginY);
        this.world.lineWidth = 2;
        this.world.lineColor = new Color(60, 70, 90);
        for (let x = marginX; x <= width - marginX; x += 80) this.world.drawLine(x, marginY, x, height - marginY);
        for (let y = marginY; y <= height - marginY; y += 80) this.world.drawLine(marginX, y, width - marginX, y);

        const px = width / 2 + Math.cos(this.time) * (width * 0.4);
        const py = height / 2 + Math.sin(this.time * 1.3) * (height * 0.4);
        this.player.clear();
        this.player.fillColor = new Color(255, 180, 100);
        this.player.drawCircle(px, py, 18);
    }

    override draw(context): void {
        this.pipeline.execute(context);
    }

    override destroy(): void {
        // Pipeline cascades destroy() to its passes; the caller-owned target/view it created are freed here.
        this.pipeline.destroy();
        this.miniRt.destroy();
        this.miniView.destroy();
        super.destroy();
    }
}

app.start(new MiniMapScene());
