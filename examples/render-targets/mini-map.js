// Auto-generated from mini-map.ts — edit the .ts source, not this file.
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
    worldContainer;
    world;
    player;
    miniRt;
    miniSprite;
    miniFrame;
    overlay;
    miniView;
    pipeline;
    time = 0;
    init() {
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
        // Sprite + frame in one overlay subtree, composited in a single pass. The
        // frame is added first so the RenderTexture-sampling sprite stays the LAST
        // draw of the frame: sampling a render target only reads back correctly
        // when no further draw follows the sampling sprite.
        this.overlay = new Container();
        this.overlay.addChild(this.miniFrame);
        this.overlay.addChild(this.miniSprite);
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
    update(delta) {
        const { width, height } = this.app.canvas;
        const marginX = 80;
        const marginY = 60;
        this.time += delta.seconds;
        this.world.clear();
        this.world.lineWidth = 2;
        this.world.lineColor = new Color(60, 70, 90);
        for (let x = marginX; x <= width - marginX; x += 80)
            this.world.drawLine(x, marginY, x, height - marginY);
        for (let y = marginY; y <= height - marginY; y += 80)
            this.world.drawLine(marginX, y, width - marginX, y);
        const px = width / 2 + Math.cos(this.time) * (width * 0.4);
        const py = height / 2 + Math.sin(this.time * 1.3) * (height * 0.4);
        this.player.clear();
        this.player.fillColor = new Color(255, 180, 100);
        this.player.drawCircle(px, py, 18);
    }
    draw(context) {
        this.pipeline.execute(context);
    }
    destroy() {
        // Pipeline cascades destroy() to its passes; the caller-owned target/view it created are freed here.
        this.pipeline.destroy();
        this.miniRt.destroy();
        this.miniView.destroy();
        super.destroy();
    }
}
app.start(new MiniMapScene());
