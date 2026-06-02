import { Application, Color, Keyboard, Scene, Sound, Text } from '@codexo/exojs';

const assets = globalThis.assets;

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            const url = assets?.audio?.uiClick ?? 'assets/demo/audio/ui-click.ogg';
            await loader.load(Sound, { shot: url });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'shot');
            this._sound.poolSize = 24;
            this._label = new Text('Hold Space to fire SFX rapidly', { fillColor: Color.white, fontSize: 24 });
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
        draw(context) {
            context.backend.clear();
            context.render(this._label);
        }
    })()
);
