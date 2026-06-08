import { assets } from '@assets';
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
    private portrait!: Sprite;
    private box!: Text;
    private beep!: Sound;
    private lineIndex = 0;
    private chars = 0;
    private timer = 0;
    private done = false;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { portrait: assets.demo.textures.shipA });
        await loader.load(Sound, { beep: assets.demo.sound.uiConfirm });
    }

    override init(loader): void {
        this.portrait = new Sprite(loader.get(Texture, 'portrait')).setAnchor(0.5).setScale(1.7).setPosition(170, 420);
        this.box = new Text('', { fillColor: Color.white, fontSize: 30, lineHeight: 40 }, { maxWidth: 600 });
        this.box.setPosition(270, 360);
        this.beep = loader.get(Sound, 'beep');
        this.app.input.onPointerTap.add(() => {
            if (!this.done) {
                this.chars = lines[this.lineIndex].length;
                this.done = true;
                return;
            }
            this.lineIndex = (this.lineIndex + 1) % lines.length;
            this.chars = 0;
            this.done = false;
        });
    }

    override update(delta): void {
        if (!this.done) {
            this.timer += delta.seconds;
            while (this.timer > 0.035 && this.chars < lines[this.lineIndex].length) {
                this.timer -= 0.035;
                this.chars++;
                this.beep.play({ playbackRate: 1.9, volume: 0.14 });
            }
            this.done = this.chars >= lines[this.lineIndex].length;
        }
        this.box.text = lines[this.lineIndex].slice(0, this.chars);
    }

    override draw(context): void {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this.portrait);
        context.render(this.box);
    }
}

app.start(new DialogSystemScene());
