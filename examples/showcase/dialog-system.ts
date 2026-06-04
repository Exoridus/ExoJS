import { sound, textures } from '@assets';
import { Application, Color, Scene, Sound, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 900,
        height: 620,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const lines = [
    'Commander, the anomaly has entered low orbit.',
    'All wings hold formation and await my signal.',
    'If this goes wrong, burn every gate behind us.',
];

class DialogSystemScene extends Scene {
    private _portrait!: Sprite;
    private _box!: Text;
    private _beep!: Sound;
    private _lineIndex = 0;
    private _chars = 0;
    private _timer = 0;
    private _done = false;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { portrait: textures.shipA });
        await loader.load(Sound, { beep: sound.uiConfirm });
    }

    override init(loader): void {
        this._portrait = new Sprite(loader.get(Texture, 'portrait')).setAnchor(0.5).setScale(1.7).setPosition(170, 420);
        this._box = new Text('', { fillColor: Color.white, fontSize: 30, lineHeight: 40 }, { maxWidth: 600 });
        this._box.setPosition(270, 360);
        this._beep = loader.get(Sound, 'beep');
        this.app.input.onPointerTap.add(() => {
            if (!this._done) {
                this._chars = lines[this._lineIndex].length;
                this._done = true;
                return;
            }
            this._lineIndex = (this._lineIndex + 1) % lines.length;
            this._chars = 0;
            this._done = false;
        });
    }

    override update(delta): void {
        if (!this._done) {
            this._timer += delta.seconds;
            while (this._timer > 0.035 && this._chars < lines[this._lineIndex].length) {
                this._timer -= 0.035;
                this._chars++;
                this._beep.play({ playbackRate: 1.9, volume: 0.14 });
            }
            this._done = this._chars >= lines[this._lineIndex].length;
        }
        this._box.text = lines[this._lineIndex].slice(0, this._chars);
    }

    override draw(context): void {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this._portrait);
        context.render(this._box);
    }
}

app.start(new DialogSystemScene());
