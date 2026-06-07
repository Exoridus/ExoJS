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
    private events!: string[];
    private counter = 0;
    private drawCount = 0;
    private timer!: Timer;
    private text!: Text;

    override async load(): Promise<void> {
        this.events = ['load'];
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        this.events.push('init');

        this.timer = new Timer(seconds(1), true);

        this.text = new Text('', { fillColor: Color.white, fontSize: 18 });
        this.text.setAnchor(0.5);
        this.text.setPosition(width / 2, height / 2);
    }

    override update(): void {
        if (this.timer.expired) {
            this.counter++;
            this.events.push(`update ${this.counter}`);
            this.timer.restart();
        }
    }

    override draw(context): void {
        this.drawCount++;
        context.backend.clear();
        this.text.text = [...this.events.slice(-8), `draw ${this.drawCount}`].join('\n');
        context.render(this.text);
    }

    override destroy(): void {
        this.events.push('destroy');
        super.destroy();
    }
}

app.start(new LifecycleScene());
