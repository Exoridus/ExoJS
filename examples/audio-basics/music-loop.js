import { Application, Color, crossFade, Graphics, Music, Scene, Text } from '@codexo/exojs';

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
            const url = assets?.audio?.musicLoop ?? 'assets/demo/audio/demo-loop-main.ogg';
            await loader.load(Music, { track: url, silent: url });
        }
        init(loader) {
            this._music = loader.get(Music, 'track');
            this._music.setLoop(true).setVolume(0.7).play();
            this._silent = loader.get(Music, 'silent');
            this._silent.setVolume(0).setLoop(true).play();

            this._ui = new Graphics();
            this._text = new Text('Click left: fade-in    Click right: fade-out', { fillColor: Color.white, fontSize: 18 });
            this._text.setPosition(160, 220);
            this.app.input.onPointerTap.add(pointer => {
                if (pointer.x < 400) {
                    void crossFade(this._silent, this._music, 900, { stopAfterFade: false });
                } else {
                    void crossFade(this._music, this._silent, 900, { stopAfterFade: false });
                }
            });
        }
        draw(context) {
            context.backend.clear();
            this._ui.clear();
            this._ui.fillColor = new Color(70, 130, 220);
            this._ui.drawRectangle(120, 280, 240, 70);
            this._ui.fillColor = new Color(220, 90, 90);
            this._ui.drawRectangle(440, 280, 240, 70);
            context.render(this._ui);
            context.render(this._text);
        }
    })()
);
