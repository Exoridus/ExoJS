import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite } from '@codexo/exojs';



// #region guide:first-scene
class HelloWorldScene extends Scene {
    private sprite!: Sprite;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
    }

    override draw(context: RenderingContext): void {
        context.render(this.sprite);
    }
}
// #endregion guide:first-scene

const app = new Application({
    scenes: { HelloWorldScene },
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

app.start(HelloWorldScene);
