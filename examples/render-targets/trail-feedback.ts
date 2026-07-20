import { Application, CallbackRenderPass, Color, type RenderingContext, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, type Time } from '@codexo/exojs';



class TrailFeedbackScene extends Scene {
    // Two render targets, ping-ponged each frame. Reading from and writing to
    // the SAME render target forms a GL feedback loop (INVALID_OPERATION), so we
    // read the faded previous frame from one target and write the new
    // accumulation into the other, then swap.
    private rtA!: RenderTexture;
    private rtB!: RenderTexture;
    private bunny!: Sprite;
    private pipeAtoB!: RenderPipeline;
    private pipeBtoA!: RenderPipeline;
    private forward = true;
    private time = 0;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.rtA = new RenderTexture(width, height);
        this.rtB = new RenderTexture(width, height);
        this.bunny = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5);

        // A 93%-alpha copy of the source target = the decaying trail.
        const decayA = new Sprite(this.rtA).setTint(new Color(255, 255, 255, 0.93));
        const decayB = new Sprite(this.rtB).setTint(new Color(255, 255, 255, 0.93));
        const showA = new Sprite(this.rtA);
        const showB = new Sprite(this.rtB);

        // Read A → write B → show B.
        this.pipeAtoB = new RenderPipeline()
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        context.backend.clear();
                        context.render(decayA);
                        context.render(this.bunny);
                    },
                    { target: this.rtB },
                ),
            )
            .addPass(new RenderNodePass(showB, { clear: Color.black }));

        // Read B → write A → show A.
        this.pipeBtoA = new RenderPipeline()
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        context.backend.clear();
                        context.render(decayB);
                        context.render(this.bunny);
                    },
                    { target: this.rtA },
                ),
            )
            .addPass(new RenderNodePass(showA, { clear: Color.black }));
    }

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.time += delta.seconds;
        this.bunny.setPosition(width / 2 + Math.cos(this.time * 2.0) * (width * 0.36), height / 2 + Math.sin(this.time * 2.7) * (height * 0.34));
    }

    override draw(context: RenderingContext): void {
        (this.forward ? this.pipeAtoB : this.pipeBtoA).execute(context);
        this.forward = !this.forward;
    }

    override destroy(): void {
        this.pipeAtoB.destroy();
        this.pipeBtoA.destroy();
        this.rtA.destroy();
        this.rtB.destroy();
        super.destroy();
    }
}

const app = new Application({
    scenes: { TrailFeedbackScene },
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

app.start(TrailFeedbackScene);
