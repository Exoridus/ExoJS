// Auto-generated from trail-feedback.ts — edit the .ts source, not this file.
import { Application, CallbackRenderPass, Color, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';
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
class TrailFeedbackScene extends Scene {
    // Two render targets, ping-ponged each frame. Reading from and writing to
    // the SAME render target forms a GL feedback loop (INVALID_OPERATION), so we
    // read the faded previous frame from one target and write the new
    // accumulation into the other, then swap.
    rtA;
    rtB;
    bunny;
    pipeAtoB;
    pipeBtoA;
    forward = true;
    time = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.rtA = new RenderTexture(width, height);
        this.rtB = new RenderTexture(width, height);
        this.bunny = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5);
        // A 93%-alpha copy of the source target = the decaying trail.
        const decayA = new Sprite(this.rtA).setTint(new Color(255, 255, 255, 0.93));
        const decayB = new Sprite(this.rtB).setTint(new Color(255, 255, 255, 0.93));
        const showA = new Sprite(this.rtA);
        const showB = new Sprite(this.rtB);
        // Read A → write B → show B.
        this.pipeAtoB = new RenderPipeline()
            .addPass(new CallbackRenderPass((context) => {
            context.backend.clear();
            context.render(decayA);
            context.render(this.bunny);
        }, { target: this.rtB }))
            .addPass(new RenderNodePass(showB, { clear: Color.black }));
        // Read B → write A → show A.
        this.pipeBtoA = new RenderPipeline()
            .addPass(new CallbackRenderPass((context) => {
            context.backend.clear();
            context.render(decayB);
            context.render(this.bunny);
        }, { target: this.rtA }))
            .addPass(new RenderNodePass(showA, { clear: Color.black }));
    }
    update(delta) {
        const { width, height } = this.app.canvas;
        this.time += delta.seconds;
        this.bunny.setPosition(width / 2 + Math.cos(this.time * 2.0) * (width * 0.36), height / 2 + Math.sin(this.time * 2.7) * (height * 0.34));
    }
    draw(context) {
        (this.forward ? this.pipeAtoB : this.pipeBtoA).execute(context);
        this.forward = !this.forward;
    }
    destroy() {
        this.pipeAtoB.destroy();
        this.pipeBtoA.destroy();
        this.rtA.destroy();
        this.rtB.destroy();
        super.destroy();
    }
}
app.start(new TrailFeedbackScene());
