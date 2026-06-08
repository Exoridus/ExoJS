import { Application, BlendModes, BlurFilter, CallbackRenderPass, Color, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';

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

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.baseRt = new RenderTexture(800, 600);
        this.glowRt = new RenderTexture(800, 600);
        this.blurredRt = new RenderTexture(800, 600);
        this.bunny = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(1.9);
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

    override update(delta): void {
        this.time += delta.seconds;
        this.bunny.setPosition(400 + Math.cos(this.time * 1.7) * 190, 300 + Math.sin(this.time * 1.2) * 160);
    }

    override draw(context): void {
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

app.start(new BloomLiteScene());
