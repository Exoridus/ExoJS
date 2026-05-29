import { Application, AudioAnalyser, Color, Graphics, Music, Scene } from '@codexo/exojs';

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
            this._analyser = new AudioAnalyser({ fftSize: 1024 });
            this._analyser.source = this._music;
            this._bars = new Graphics();
            this._levels = { low: 0, mid: 0, high: 0 };
        }
        update() {
            const v = this._analyser.getLowMidHigh();
            this._levels.low = v.low;
            this._levels.mid = v.mid;
            this._levels.high = v.high;
        }
        draw(context) {
            context.backend.clear();
            this._bars.clear();
            const values = [this._levels.low, this._levels.mid, this._levels.high];
            const colors = [new Color(255, 140, 120), new Color(130, 220, 255), new Color(150, 255, 150)];
            for (let i = 0; i < 3; i++) {
                this._bars.fillColor = new Color(60, 60, 60);
                this._bars.drawRectangle(180 + i * 170, 420, 110, -260);
                this._bars.fillColor = colors[i];
                this._bars.drawRectangle(180 + i * 170, 420, 110, -260 * values[i]);
            }
            context.render(this._bars);
        }
    })()
);
