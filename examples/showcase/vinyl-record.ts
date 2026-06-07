import { audio } from '@assets';
import { Application, AudioAnalyser, BeatDetector, Color, Graphics, Music, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class VinylRecordScene extends Scene {
    private music!: Music;
    private beat!: BeatDetector;
    private analyser!: AudioAnalyser;
    private disc!: Graphics;
    private bars!: Graphics;
    private angle = 0;

    override async load(loader): Promise<void> {
        await loader.load(Music, { track: audio.musicLoop });
    }

    override init(loader): void {
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this.beat = new BeatDetector();
        this.beat.source = this.music;
        this.analyser = new AudioAnalyser({ fftSize: 1024 });
        this.analyser.source = this.music;
        this.disc = new Graphics();
        this.bars = new Graphics();
    }

    override update(delta): void {
        const bpm = this.beat.tempo > 0 ? this.beat.tempo : 120;
        this.angle += delta.seconds * (bpm / 60) * 360;
    }

    override draw(context): void {
        const spectrum = this.analyser.getSpectrum();
        context.backend.clear(new Color(16, 18, 26));
        this.disc.clear();
        this.disc.fillColor = new Color(28, 28, 30);
        this.disc.drawCircle(400, 300, 150);
        this.disc.fillColor = new Color(220, 90, 90);
        this.disc.drawCircle(400, 300, 32);
        this.disc.lineWidth = 2;
        this.disc.lineColor = new Color(80, 80, 84);
        for (let r = 45; r <= 140; r += 14) this.disc.drawArc(400, 300, r, 0, Math.PI * 2);
        context.render(this.disc);

        this.bars.clear();
        for (let i = 0; i < 36; i++) {
            const a = (i / 36) * Math.PI * 2 + (this.angle * Math.PI) / 180;
            const bin = (i * 6) % spectrum.length;
            const len = 20 + (spectrum[bin] / 255) * 55;
            const x0 = 400 + Math.cos(a) * 170;
            const y0 = 300 + Math.sin(a) * 170;
            const x1 = 400 + Math.cos(a) * (170 + len);
            const y1 = 300 + Math.sin(a) * (170 + len);
            this.bars.lineWidth = 4;
            this.bars.lineColor = new Color(120, 200, 255);
            this.bars.drawLine(x0, y0, x1, y1);
        }
        context.render(this.bars);
    }
}

app.start(new VinylRecordScene());
