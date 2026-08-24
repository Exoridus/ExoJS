import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Text } from '@codexo/exojs';



class StrokeAndShadowScene extends Scene {
    private title!: Text;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        this.title = new Text('EXOJS', {
            fillColor: new Color(230, 240, 255),
            fontSize: 120,
            outlineColor: new Color(70, 130, 220),
            outlineWidth: 0.3,
            shadowColor: Color.black,
            shadowAlpha: 0.6,
            shadowOffsetX: 6,
            shadowOffsetY: 6,
            shadowBlur: 0.4,
        });
        this.title.setAnchor(0.5, 0.5);
        this.title.setPosition(width / 2, height / 2);
    }

    override draw(context: RenderingContext): void {
        context.render(this.title);
    }
}

const app = new Application({
    scenes: { StrokeAndShadowScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizing: new FixedResolutionCanvasSizing(),
    },
    clearColor: new Color(24, 28, 42),
    loader: {
        basePath: 'assets/',
    },
});

app.start(StrokeAndShadowScene);
