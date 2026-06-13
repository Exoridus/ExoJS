// Auto-generated from stroke-and-shadow.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Text } from '@codexo/exojs';
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
class StrokeAndShadowScene extends Scene {
    title;
    init() {
        const { width, height } = this.app.canvas;
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
    draw(context) {
        context.backend.clear(new Color(24, 28, 42));
        context.render(this.title);
    }
}
app.start(new StrokeAndShadowScene());
