import { Application, Color, Scene, seconds, Text, Timer } from '@codexo/exojs';

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

app.start(
    new (class extends Scene {
        async load() {
            this._events = ['load'];
        }
        init() {
            const { width, height } = this.app.canvas;

            this._events.push('init');
            this._counter = 0;
            this._drawCount = 0;
            this._timer = new Timer(seconds(1), true);
            this._text = new Text('', { fillColor: Color.white, fontSize: 18 });
            this._text.setAnchor(0.5);
            this._text.setPosition(width / 2, height / 2);
        }
        update() {
            if (this._timer.expired) {
                this._counter++;
                this._events.push(`update ${this._counter}`);
                this._timer.restart();
            }
        }
        draw(context) {
            this._drawCount++;
            context.backend.clear();
            this._text.text = [...this._events.slice(-8), `draw ${this._drawCount}`].join('\n');
            context.render(this._text);
        }
        destroy() {
            this._events.push('destroy');
            super.destroy();
        }
    })()
);
