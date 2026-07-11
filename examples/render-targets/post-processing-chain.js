// Auto-generated from post-processing-chain.ts — edit the .ts source, not this file.
import { Application, BlurFilter, CallbackRenderPass, Color, ColorFilter, Graphics, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite } from '@codexo/exojs';
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
class PostProcessingChainScene extends Scene {
    scene;
    a;
    b;
    c;
    blur;
    color;
    final;
    pipeline;
    time = 0;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.scene = new Graphics();
        this.a = new RenderTexture(width, height);
        this.b = new RenderTexture(width, height);
        this.c = new RenderTexture(width, height);
        this.blur = new BlurFilter({ radius: 6, quality: 2 });
        this.color = new ColorFilter(new Color(140, 190, 255));
        this.final = new Sprite(this.c);
        // Configured once: scene → off-screen, two filter passes, composite to the canvas.
        this.pipeline = new RenderPipeline()
            .addPass(new RenderNodePass(this.scene, { target: this.a, clear: Color.black }))
            .addPass(new CallbackRenderPass((context) => this.blur.apply(context.backend, this.a, this.b)))
            .addPass(new CallbackRenderPass((context) => this.color.apply(context.backend, this.b, this.c)))
            .addPass(new RenderNodePass(this.final, { clear: Color.black }));
    }
    update(delta) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.time += delta.seconds;
        this.scene.clear();
        this.scene.fillColor = new Color(80, 130, 255);
        this.scene.drawCircle(width / 2 + Math.cos(this.time * 1.6) * (width * 0.32), height / 2 + Math.sin(this.time * 1.8) * (height * 0.32), 78);
        this.scene.fillColor = new Color(255, 170, 90);
        this.scene.drawCircle(width / 2 + Math.cos(this.time * 1.2 + 1) * (width * 0.3), height / 2 + Math.sin(this.time * 1.3 + 0.7) * (height * 0.34), 54);
    }
    draw(context) {
        this.pipeline.execute(context);
    }
    destroy() {
        // Pipeline cascades destroy() to its passes; the caller-owned targets and filters it created are freed here.
        this.pipeline.destroy();
        this.a.destroy();
        this.b.destroy();
        this.c.destroy();
        this.blur.destroy();
        this.color.destroy();
        super.destroy();
    }
}
app.start(new PostProcessingChainScene());
