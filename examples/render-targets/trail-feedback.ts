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
    private rt!: RenderTexture;
    private decay!: Sprite;
    private bunny!: Sprite;
    private final!: Sprite;
    private pipeline!: RenderPipeline;
    private time = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.rt = new RenderTexture(width, height);
        this.decay = new Sprite(this.rt).setTint(new Color(255, 255, 255, 0.93));
        this.bunny = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5);
        this.final = new Sprite(this.rt);

        // Feedback: the off-screen target is deliberately NOT cleared, so the decayed previous frame
        // plus the bunny accumulate into a trail; the final sprite composites it to the screen.
        this.pipeline = new RenderPipeline()
            .addPass(
                new CallbackRenderPass(
                    (context) => {
                        context.render(this.decay);
                        context.render(this.bunny);
                    },
                    { target: this.rt },
                ),
            )
            .addPass(new RenderNodePass(this.final, { clear: Color.black }));
    }

    override update(delta): void {
        const { width, height } = this.app.canvas;
        this.time += delta.seconds;
        this.bunny.setPosition(width / 2 + Math.cos(this.time * 2.0) * (width * 0.36), height / 2 + Math.sin(this.time * 2.7) * (height * 0.34));
    }

    override draw(context): void {
        this.pipeline.execute(context);
    }

    override destroy(): void {
        // Pipeline cascades destroy() to its passes; the caller-owned feedback target is freed here.
        this.pipeline.destroy();
        this.rt.destroy();
        super.destroy();
    }
}

app.start(new TrailFeedbackScene());
