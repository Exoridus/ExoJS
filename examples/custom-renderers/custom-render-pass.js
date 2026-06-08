// Auto-generated from custom-render-pass.ts — edit the .ts source, not this file.
import { Application, CallbackRenderPass, Color, Graphics, RenderNodePass, RenderPipeline, Scene, Sprite, Texture } from '@codexo/exojs';
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
    back;
    front;
    between;
    pipeline;
    angle = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
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
        // A callback pass slots procedural geometry between two scene nodes — same frame order
        // as the imperative version, now a named, inspectable step.
        this.pipeline = new RenderPipeline()
            .addPass(new RenderNodePass(this.back, { clear: Color.black }))
            .addPass(new CallbackRenderPass((context) => {
            this.between.clear();
            this.between.lineWidth = 10;
            this.between.lineColor = new Color(130, 240, 170);
            this.between.drawArc(400, 300, 120, this.angle, this.angle + Math.PI * 1.3);
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
