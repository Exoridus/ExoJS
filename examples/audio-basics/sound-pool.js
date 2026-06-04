// Auto-generated from sound-pool.ts — edit the .ts source, not this file.
import { audio } from '@assets';
import { Application, Color, Keyboard, Scene, Sound, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class SoundPoolScene extends Scene {
    _sound;
    _label;
    _firing = false;
    _timer = 0;
    async load(loader) {
        await loader.load(Sound, { shot: audio.uiClick });
    }
    init(loader) {
        this._sound = loader.get(Sound, 'shot');
        this._sound.poolSize = 24;
        this._label = new Text('Hold Space to fire SFX rapidly', { fillColor: Color.white, fontSize: 24 });
        this._label.setPosition(190, 280);
        this.inputs.onActive(Keyboard.Space, () => {
            this._firing = true;
        });
        this.inputs.onStop(Keyboard.Space, () => {
            this._firing = false;
        });
    }
    update(delta) {
        if (!this._firing)
            return;
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
}
app.start(new SoundPoolScene());
