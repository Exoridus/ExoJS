import { Application, Color, Keyboard, Scene, Sound, Text } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Sound, { shot: 'audio/example.ogg' });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'shot');
            this._sound.poolSize = 24;
            this._label = new Text('Hold Space to fire SFX rapidly', { fill: 'white', fontSize: 24 });
            this._label.setPosition(190, 280);
            this._firing = false;

            this.inputs.onActive(Keyboard.Space, () => {
                this._firing = true;
            });
            this.inputs.onStop(Keyboard.Space, () => {
                this._firing = false;
            });
            this._timer = 0;
        }
        update(delta) {
            if (!this._firing) return;
            this._timer += delta.seconds;
            while (this._timer >= 0.05) {
                this._timer -= 0.05;
                this._sound.play();
            }
        }
        draw(backend) {
            backend.clear();
            this._label.render(backend);
        }
    })()
);
