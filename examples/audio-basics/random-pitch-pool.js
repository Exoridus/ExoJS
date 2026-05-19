import { Application, Color, Keyboard, Scene, Sound, Text } from '@codexo/exojs';

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
        async load(loader) {
            await loader.load(Sound, { blip: 'audio/example.ogg' });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'blip');
            this._sound.poolSize = 20;
            this._text = new Text('Hold Space for random pitch detune', { fill: 'white', fontSize: 24 });
            this._text.setPosition(170, 280);
            this._active = false;
            this._timer = 0;

            this.inputs.onActive(Keyboard.Space, () => {
                this._active = true;
            });
            this.inputs.onStop(Keyboard.Space, () => {
                this._active = false;
            });
        }
        update(delta) {
            if (!this._active) return;
            this._timer += delta.seconds;
            while (this._timer > 0.08) {
                this._timer -= 0.08;
                const cents = Math.random() * 400 - 200;
                this._sound.play({ playbackRate: Math.pow(2, cents / 1200) });
            }
        }
        draw(backend) {
            backend.clear();
            this._text.render(backend);
        }
    })()
);
