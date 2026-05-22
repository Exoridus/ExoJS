import { Application, BeatDetector, Color, Graphics, Music, Scene, Text } from '@codexo/exojs';

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
        }
        init(loader) {
            this._music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
            this._detector = new BeatDetector();
            this._detector.source = this._music;
            this._text = new Text('', { fill: 'white', fontSize: 28 });
            this._text.setPosition(280, 220);
            this._bar = new Graphics();
        }
        draw(backend) {
            const bpm = this._detector.tempo;
            const confidence = this._detector.confidence;
            this._text.text = `BPM ${bpm.toFixed(1)}\nconfidence ${confidence.toFixed(2)}`;
            backend.clear();
            this._bar.clear();
            this._bar.fillColor = new Color(70, 70, 70);
            this._bar.drawRectangle(220, 360, 360, 22);
            this._bar.fillColor = new Color(120, 220, 150);
            this._bar.drawRectangle(220, 360, 360 * confidence, 22);
            this._bar.render(backend);
            this._text.render(backend);
        }
    })()
);
