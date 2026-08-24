import { Application, Asset, Assets, Color, Container, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite, type Time } from '@codexo/exojs';



class ContainersScene extends Scene {
    private rainbow!: Sprite;
    private bunnies!: Container;

    override init(): void {
        const app = this.app;
        const { width, height } = app;
        const { bunny, rainbow } = this.loader.get(Assets.from({ bunny: Asset.type('texture', 'image/ship-a.png'), rainbow: Asset.type('texture', 'image/hue-ramp.png') }));

        this.rainbow = new Sprite(rainbow);

        this.bunnies = new Container();
        this.bunnies.setPosition((width / 2) | 0, (height / 2) | 0);

        for (let i = 0; i < 25; i++) {
            const sprite = new Sprite(bunny);

            sprite.setPosition((i % 5) * (sprite.width + 15), ((i / 5) | 0) * (sprite.height + 10));

            this.bunnies.addChild(sprite);
        }

    }

    override update(delta: Time): void {
        const bounds = this.bunnies.getBounds();

        this.rainbow.x = bounds.x;
        this.rainbow.y = bounds.y;
        this.rainbow.width = bounds.width;
        this.rainbow.height = bounds.height;

        this.bunnies.rotate(delta.seconds * 36);
    }

    override draw(context: RenderingContext): void {
        context.render(this.rainbow);
        context.render(this.bunnies);
    }
}

const app = new Application({
    scenes: { ContainersScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizing: new FixedResolutionCanvasSizing(),
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

app.start(ContainersScene);
