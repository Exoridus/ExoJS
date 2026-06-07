import { Application, Color, Scene, seconds, Signal, Text, Timer } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 820,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class SignalBusInspectorScene extends Scene {
    private signals!: { spawn: Signal; damage: Signal; score: Signal };
    private text!: Text;
    private tick!: Timer;
    private listenerA!: () => void;
    private listenerB!: () => void;

    override init(): void {
        this.signals = {
            spawn: new Signal(),
            damage: new Signal(),
            score: new Signal(),
        };
        this.text = new Text('', { fillColor: Color.white, fontSize: 19, lineHeight: 28 });
        this.text.setPosition(40, 70);
        this.tick = new Timer(seconds(1), true);
        this.listenerA = () => undefined;
        this.listenerB = () => undefined;
        this.signals.spawn.add(this.listenerA);
        this.signals.damage.add(this.listenerA);
        this.signals.damage.add(this.listenerB);
        this.signals.score.add(this.listenerA);
    }

    override update(): void {
        if (this.tick.expired) {
            if (Math.random() > 0.5) this.signals.spawn.add(this.listenerB);
            else this.signals.spawn.remove(this.listenerB);
            this.signals.spawn.dispatch();
            this.signals.damage.dispatch();
            this.signals.score.dispatch();
            this.tick.restart();
        }
    }

    override draw(context): void {
        this.text.text =
            `Manual Signal Inspector\n\nspawn listeners: ${this.signals.spawn.count}\n` +
                `damage listeners: ${this.signals.damage.count}\n` +
                `score listeners: ${this.signals.score.count}`;
        context.backend.clear();
        context.render(this.text);
    }
}

app.start(new SignalBusInspectorScene());
