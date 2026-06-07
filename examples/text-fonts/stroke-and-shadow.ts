import { Application, Color, Scene, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 900,
        height: 520,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class StrokeAndShadowScene extends Scene {
    private title!: Text;

    override init(): void {
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
        this.title.setPosition(180, 190);
    }

    override draw(context): void {
        context.backend.clear(new Color(24, 28, 42));
        context.render(this.title);
    }
}

app.start(new StrokeAndShadowScene());
