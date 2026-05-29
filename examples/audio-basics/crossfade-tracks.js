import { Application, Color, crossFade, Music, Scene, Text } from '@codexo/exojs';

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
            const urlA = assets?.audio?.musicA ?? 'assets/demo/audio/ui-bong.ogg';
            const urlB = assets?.audio?.musicB ?? 'assets/demo/audio/impact-heavy.ogg';
            await loader.load(Music, { a: urlA, b: urlB });
        }
        init(loader) {
            this._trackA = loader.get(Music, 'a').setLoop(true).setVolume(0.7).play();
            this._trackB = loader.get(Music, 'b').setLoop(true).setVolume(0).play();
            this._toB = true;
            this._text = new Text('Click to crossfade tracks over 2s', { fill: 'white', fontSize: 24 });
            this._text.setPosition(170, 280);

            this.app.input.onPointerTap.add(() => {
                if (this._toB) {
                    void crossFade(this._trackA, this._trackB, 2000, { stopAfterFade: false });
                } else {
                    void crossFade(this._trackB, this._trackA, 2000, { stopAfterFade: false });
                }
                this._toB = !this._toB;
            });
        }
        draw(context) {
            context.backend.clear();
            context.render(this._text);
        }
    })()
);
