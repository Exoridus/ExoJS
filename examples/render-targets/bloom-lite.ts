import { Application, BlendModes, BlurFilter, CallbackRenderPass, Color, type RenderingContext, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, type Time } from '@codexo/exojs';



class BloomLiteScene extends Scene {
    private baseRt!: RenderTexture;
    private glowRt!: RenderTexture;
    private blurredRt!: RenderTexture;
    private bunny!: Sprite;
    private baseSprite!: Sprite;
    private glowSprite!: Sprite;
    private blur!: BlurFilter;
    private pipeline!: RenderPipeline;
    private time = 0;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.baseRt = new RenderTexture(width, height);
        this.glowRt = new RenderTexture(width, height);
        this.blurredRt = new RenderTexture(width, height);
        this.bunny = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setScale(1.9);
        this.baseSprite = new Sprite(this.baseRt);
        this.glowSprite = new Sprite(this.blurredRt).setTint(new Color(255, 255, 255, 0.8)).setBlendMode(BlendModes.Additive);
        this.blur = new BlurFilter({ radius: 10, quality: 2 });

        // The same sprite is drawn twice with different tints (white base, warm glow), so each
        // off-screen step is a callback that sets the tint before rendering.
        this.pipeline = new RenderPipeline()
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        this.bunny.setTint(Color.white);
                        context.render(this.bunny);
                    },
                    { target: this.baseRt, clear: Color.black },
                ),
            )
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        this.bunny.setTint(new Color(255, 230, 190));
                        context.render(this.bunny);
                    },
                    { target: this.glowRt, clear: Color.black },
                ),
            )
            .addPass(new CallbackRenderPass((context) => this.blur.apply(context.backend, this.glowRt, this.blurredRt)))
            .addPass(new RenderNodePass(this.baseSprite, { clear: Color.black }))
            .addPass(new RenderNodePass(this.glowSprite));
    }

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.time += delta.seconds;
        this.bunny.setPosition(width / 2 + Math.cos(this.time * 1.7) * (width * 0.32), height / 2 + Math.sin(this.time * 1.2) * (height * 0.32));
    }

    override draw(context: RenderingContext): void {
        this.pipeline.execute(context);
    }

    override destroy(): void {
        // Pipeline cascades destroy() to its passes; the caller-owned targets and blur filter are freed here.
        this.pipeline.destroy();
        this.baseRt.destroy();
        this.glowRt.destroy();
        this.blurredRt.destroy();
        this.blur.destroy();
        super.destroy();
    }
}

const app = new Application({
    scenes: { BloomLiteScene },
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

app.start(BloomLiteScene);
