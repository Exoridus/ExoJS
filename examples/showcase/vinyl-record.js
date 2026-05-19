import { Application, AudioAnalyser, BeatDetector, Color, Graphics, Music, Scene } from '@codexo/exojs';

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
            this._beat = new BeatDetector();
            this._beat.source = this._music;
            this._analyser = new AudioAnalyser({ fftSize: 1024 });
            this._analyser.source = this._music;
            this._disc = new Graphics();
            this._bars = new Graphics();
            this._angle = 0;
        }
        update(delta) {
            const bpm = this._beat.tempo > 0 ? this._beat.tempo : 120;
            this._angle += delta.seconds * (bpm / 60) * 360;
        }
        draw(backend) {
            const spectrum = this._analyser.getSpectrum();
            backend.clear(new Color(16, 18, 26));
            this._disc.clear();
            this._disc.fillColor = new Color(28, 28, 30);
            this._disc.drawCircle(400, 300, 150);
            this._disc.fillColor = new Color(220, 90, 90);
            this._disc.drawCircle(400, 300, 32);
            this._disc.lineWidth = 2;
            this._disc.lineColor = new Color(80, 80, 84);
            for (let r = 45; r <= 140; r += 14) this._disc.drawArc(400, 300, r, 0, Math.PI * 2);
            this._disc.render(backend);

            this._bars.clear();
            for (let i = 0; i < 36; i++) {
                const a = (i / 36) * Math.PI * 2 + (this._angle * Math.PI) / 180;
                const bin = (i * 6) % spectrum.length;
                const len = 20 + (spectrum[bin] / 255) * 55;
                const x0 = 400 + Math.cos(a) * 170;
                const y0 = 300 + Math.sin(a) * 170;
                const x1 = 400 + Math.cos(a) * (170 + len);
                const y1 = 300 + Math.sin(a) * (170 + len);
                this._bars.lineWidth = 4;
                this._bars.lineColor = new Color(120, 200, 255);
                this._bars.drawLine(x0, y0, x1, y1);
            }
            this._bars.render(backend);
        }
    })()
);
