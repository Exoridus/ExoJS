// Auto-generated from custom-render-pass.ts — edit the .ts source, not this file.
import { Application, CallbackRenderPass, Color, Graphics, RenderNodePass, RenderPipeline, Scene, Sprite } from '@codexo/exojs';
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
class CustomRenderPassScene extends Scene {
    back;
    front;
    between;
    pipeline;
    angle = 0;
    async load(loader) {
        await loader.load('image/ship-a.png');
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.back = new Sprite(loader.get('image/ship-a.png'))
            .setAnchor(0.5)
            .setPosition(width / 2 - 200, height / 2)
            .setScale(2.2)
            .setTint(new Color(120, 170, 255));
        this.front = new Sprite(loader.get('image/ship-a.png'))
            .setAnchor(0.5)
            .setPosition(width / 2 + 200, height / 2)
            .setScale(2.2)
            .setTint(new Color(255, 180, 120));
        this.between = new Graphics();
        // A callback pass slots procedural geometry between two scene nodes — same frame order
        // as the imperative version, now a named, inspectable step.
        this.pipeline = new RenderPipeline()
            .addPass(new RenderNodePass(this.back, { clear: Color.black }))
            .addPass(new CallbackRenderPass((context) => {
            const { width: w, height: h } = this.app.canvas;
            this.between.clear();
            this.between.lineWidth = 10;
            this.between.lineColor = new Color(130, 240, 170);
            this.between.drawArc(w / 2, h / 2, 120, this.angle, this.angle + Math.PI * 1.3);
            this.between.render(context.backend);
        }))
            .addPass(new RenderNodePass(this.front));
    }
    update(delta) {
        this.angle += delta.seconds * 2.2;
    }
    draw(context) {
        this.pipeline.execute(context);
    }
}
app.start(new CustomRenderPassScene());
