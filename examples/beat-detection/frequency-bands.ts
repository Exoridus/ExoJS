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

class FrequencyBandsScene extends Scene {
    private _music!: Music;
    private _analyser!: AudioAnalyser;
    private _bars!: Graphics;
    private _levels = { low: 0, mid: 0, high: 0 };

    override async load(loader): Promise<void> {
        await loader.load(Music, { track: 'audio/demo-loop-main.ogg' });
    }

    override init(loader): void {
        this._music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this._analyser = new AudioAnalyser({ fftSize: 1024 });
        this._analyser.source = this._music;
        this._bars = new Graphics();
    }

    override update(): void {
        const v = this._analyser.getLowMidHigh();
        this._levels.low = v.low;
        this._levels.mid = v.mid;
        this._levels.high = v.high;
    }

    override draw(context): void {
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
}

app.start(new FrequencyBandsScene());
