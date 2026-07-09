// Auto-generated from basic-text.ts — edit the .ts source, not this file.
import { Application, Color, FontAsset, Scene, Text, Time } from '@codexo/exojs';
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
class BasicTextScene extends Scene {
    time;
    text;
    async load(loader) {
        await loader.load(FontAsset.of('font/Kenney Future.ttf', { family: 'Kenney Future' }));
    }
    init() {
        const { width, height } = this.app.canvas;
        this.time = new Time();
        this.text = new Text('Hello World!', {
            align: 'left',
            fillColor: Color.white,
            outlineColor: Color.black,
            outlineWidth: 0.2,
            fontSize: 25,
            fontFamily: 'Kenney Future',
        });
        this.text.setPosition(width / 2, height / 2);
        this.text.setAnchor(0.5, 0.5);
    }
    update(delta) {
        this.text.text = `Hello World! ${this.time.addTime(delta).seconds | 0}`;
        this.text.rotate(delta.seconds * 36);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new BasicTextScene());
