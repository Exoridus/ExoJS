// Auto-generated from trail-feedback.ts — edit the .ts source, not this file.
import { Application, CallbackRenderPass, Color, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';
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
class TrailFeedbackScene extends Scene {
    rt;
    decay;
    bunny;
    final;
    pipeline;
    time = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.rt = new RenderTexture(800, 600);
        this.decay = new Sprite(this.rt).setTint(new Color(255, 255, 255, 0.93));
        this.bunny = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5);
        this.final = new Sprite(this.rt);
        // Feedback: the off-screen target is deliberately NOT cleared, so the decayed previous frame
        // plus the bunny accumulate into a trail; the final sprite composites it to the screen.
        this.pipeline = new RenderPipeline()
            .addPass(new CallbackRenderPass((context) => {
            context.render(this.decay);
            context.render(this.bunny);
        }, { target: this.rt }))
            .addPass(new RenderNodePass(this.final, { clear: Color.black }));
    }
    update(delta) {
        this.time += delta.seconds;
        this.bunny.setPosition(400 + Math.cos(this.time * 2.0) * 230, 300 + Math.sin(this.time * 2.7) * 170);
    }
    draw(context) {
        this.pipeline.execute(context);
    }
    destroy() {
        // Pipeline cascades destroy() to its passes; the caller-owned feedback target is freed here.
        this.pipeline.destroy();
        this.rt.destroy();
        super.destroy();
    }
}
app.start(new TrailFeedbackScene());
