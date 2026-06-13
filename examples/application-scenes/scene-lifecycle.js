// Auto-generated from scene-lifecycle.ts — edit the .ts source, not this file.
import { Application, Color, Scene, seconds, Text, Timer } from '@codexo/exojs';
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
class LifecycleScene extends Scene {
    events;
    counter = 0;
    drawCount = 0;
    timer;
    text;
    async load() {
        this.events = ['load'];
    }
    init() {
        const { width, height } = this.app.canvas;
        this.events.push('init');
        this.timer = new Timer(seconds(1), true);
        this.text = new Text('', { fillColor: Color.white, fontSize: 18 });
        this.text.setAnchor(0.5);
        this.text.setPosition(width / 2, height / 2);
    }
    update() {
        if (this.timer.expired) {
            this.counter++;
            this.events.push(`update ${this.counter}`);
            this.timer.restart();
        }
    }
    draw(context) {
        this.drawCount++;
        context.backend.clear();
        this.text.text = [...this.events.slice(-8), `draw ${this.drawCount}`].join('\n');
        context.render(this.text);
    }
    destroy() {
        this.events.push('destroy');
        super.destroy();
    }
}
app.start(new LifecycleScene());
