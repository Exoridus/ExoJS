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

class RandomPitchPoolScene extends Scene {
    private _sound!: Sound;
    private _text!: Text;
    private _active = false;
    private _timer = 0;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { blip: audio.impactLight });
    }

    override init(loader): void {
        this._sound = loader.get(Sound, 'blip');
        this._sound.poolSize = 20;
        this._text = new Text('Hold Space for random pitch detune', { fillColor: Color.white, fontSize: 24 });
        this._text.setPosition(170, 280);

        this.inputs.onActive(Keyboard.Space, () => {
            this._active = true;
        });
        this.inputs.onStop(Keyboard.Space, () => {
            this._active = false;
        });
    }

    override update(delta): void {
        if (!this._active) return;
        this._timer += delta.seconds;
        while (this._timer > 0.08) {
            this._timer -= 0.08;
            const cents = Math.random() * 400 - 200;
            this._sound.play({ playbackRate: Math.pow(2, cents / 1200) });
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._text);
    }
}

app.start(new RandomPitchPoolScene());
