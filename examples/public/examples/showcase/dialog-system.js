import { Application, Color, Scene, Sound, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    width: 900,
    height: 620,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

const lines = [
    'Commander, the anomaly has entered low orbit.',
    'All wings hold formation and await my signal.',
    'If this goes wrong, burn every gate behind us.',
];

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { portrait: 'image/bunny.png' });
            await loader.load(Sound, { beep: 'audio/example.ogg' });
        }
        init(loader) {
            this._portrait = new Sprite(loader.get(Texture, 'portrait')).setAnchor(0.5).setScale(1.7).setPosition(170, 420);
            this._box = new Text('', { fill: 'white', fontSize: 30, wordWrap: true, wordWrapWidth: 600, lineHeight: 40 });
            this._box.setPosition(270, 360);
            this._beep = loader.get(Sound, 'beep');
            this._lineIndex = 0;
            this._chars = 0;
            this._timer = 0;
            this._done = false;
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
        update(delta) {
            if (!this._done) {
                this._timer += delta.seconds;
                while (this._timer > 0.035 && this._chars < lines[this._lineIndex].length) {
                    this._timer -= 0.035;
                    this._chars++;
                    this._beep.play({ playbackRate: 1.9, volume: 0.14 });
                }
                this._done = this._chars >= lines[this._lineIndex].length;
            }
            this._box.setText(lines[this._lineIndex].slice(0, this._chars));
        }
        draw(backend) {
            backend.clear(new Color(20, 24, 34));
            this._portrait.render(backend);
            this._box.render(backend);
        }
    })()
);
