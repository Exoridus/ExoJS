import { Application, AudioAnalyser, Color, Music, Scene, Sprite, Texture, View } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Music, { track: 'audio/example.ogg' });
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
            this._analyser = new AudioAnalyser({ fftSize: 1024 });
            this._analyser.source = this._music;
            this._view = new View(400, 300, 800, 600);
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2).setPosition(400, 300);
        }
        update() {
            const low = this._analyser.getBandEnergy(20, 180);
            this._view.shake(2 + low * 26, 90, { decay: true, frequency: 22 });
        }
        draw(context) {
            context.backend.clear(new Color(22, 24, 34));
            context.backend.setView(this._view);
            context.render(this._sprite);
            context.backend.setView(null);
        }
    })()
);
