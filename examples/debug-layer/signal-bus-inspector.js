// Auto-generated from signal-bus-inspector.ts — edit the .ts source, not this file.
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
    _signals;
    _text;
    _tick;
    _listenerA;
    _listenerB;
    init() {
        this._signals = {
            spawn: new Signal(),
            damage: new Signal(),
            score: new Signal(),
        };
        this._text = new Text('', { fillColor: Color.white, fontSize: 19, lineHeight: 28 });
        this._text.setPosition(40, 70);
        this._tick = new Timer(seconds(1), true);
        this._listenerA = () => undefined;
        this._listenerB = () => undefined;
        this._signals.spawn.add(this._listenerA);
        this._signals.damage.add(this._listenerA);
        this._signals.damage.add(this._listenerB);
        this._signals.score.add(this._listenerA);
    }
    update() {
        if (this._tick.expired) {
            if (Math.random() > 0.5)
                this._signals.spawn.add(this._listenerB);
            else
                this._signals.spawn.remove(this._listenerB);
            this._signals.spawn.dispatch();
            this._signals.damage.dispatch();
            this._signals.score.dispatch();
            this._tick.restart();
        }
    }
    draw(context) {
        this._text.text =
            `Manual Signal Inspector\n\nspawn listeners: ${this._signals.spawn.count}\n` +
                `damage listeners: ${this._signals.damage.count}\n` +
                `score listeners: ${this._signals.score.count}`;
        context.backend.clear();
        context.render(this._text);
    }
}
app.start(new SignalBusInspectorScene());
