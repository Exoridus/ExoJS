import { audio } from '@assets';
import { Application, Color, Scene, Sound, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class PlaySoundScene extends Scene {
    private _sound!: Sound;
    private _text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { click: audio.uiClick });
    }

    override init(loader): void {
        this._sound = loader.get(Sound, 'click');
        this._text = new Text('Click anywhere to play SFX', { fillColor: Color.white, fontSize: 24 });
        this._text.setPosition(220, 280);
        this.app.input.onPointerTap.add(() => {
            this._sound.play();
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._text);
    }
}

app.start(new PlaySoundScene());
