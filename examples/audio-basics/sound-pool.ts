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
    private _sound!: Sound;
    private _label!: Text;
    private _firing = false;
    private _timer = 0;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { shot: audio.uiClick });
    }

    override init(loader): void {
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

    override update(delta): void {
        if (!this._firing) return;
        this._timer += delta.seconds;
        while (this._timer >= 0.05) {
            this._timer -= 0.05;
            this._sound.play();
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._label);
    }
}

app.start(new SoundPoolScene());
