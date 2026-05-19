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

app.start(
    new (class extends Scene {
        init() {
            this._signals = {
                spawn: new Signal(),
                damage: new Signal(),
                score: new Signal(),
            };
            this._text = new Text('', { fill: 'white', fontSize: 19, lineHeight: 28 });
            this._text.setPosition(40, 70);
            this._tick = new Timer(seconds(1), true);
            this._listenerA = () => {};
            this._listenerB = () => {};
            this._signals.spawn.add(this._listenerA);
            this._signals.damage.add(this._listenerA);
            this._signals.damage.add(this._listenerB);
            this._signals.score.add(this._listenerA);
        }
        update(_delta) {
            if (this._tick.expired) {
                if (Math.random() > 0.5) this._signals.spawn.add(this._listenerB);
                else this._signals.spawn.remove(this._listenerB);
                this._signals.spawn.dispatch();
                this._signals.damage.dispatch();
                this._signals.score.dispatch();
                console.log('signal snapshot', {
                    spawn: this._signals.spawn.bindings.length,
                    damage: this._signals.damage.bindings.length,
                    score: this._signals.score.bindings.length,
                });
                this._tick.restart();
            }
        }
        draw(backend) {
            this._text.setText(
                `Manual Signal Inspector\n\nspawn listeners: ${this._signals.spawn.bindings.length}\n` +
                    `damage listeners: ${this._signals.damage.bindings.length}\n` +
                    `score listeners: ${this._signals.score.bindings.length}`
            );
            backend.clear();
            this._text.render(backend);
        }
    })()
);
