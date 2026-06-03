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

class LifecycleScene extends Scene {
    private _events!: string[];
    private _counter = 0;
    private _drawCount = 0;
    private _timer!: Timer;
    private _text!: Text;

    override async load(): Promise<void> {
        this._events = ['load'];
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        this._events.push('init');

        this._timer = new Timer(seconds(1), true);

        this._text = new Text('', { fillColor: Color.white, fontSize: 18 });
        this._text.setAnchor(0.5);
        this._text.setPosition(width / 2, height / 2);
    }

    override update(): void {
        if (this._timer.expired) {
            this._counter++;
            this._events.push(`update ${this._counter}`);
            this._timer.restart();
        }
    }

    override draw(context): void {
        this._drawCount++;
        context.backend.clear();
        this._text.text = [...this._events.slice(-8), `draw ${this._drawCount}`].join('\n');
        context.render(this._text);
    }

    override destroy(): void {
        this._events.push('destroy');
        super.destroy();
    }
}

app.start(new LifecycleScene());
