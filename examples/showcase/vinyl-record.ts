import { Application, AudioStream, Color, Graphics, Scene, Text, type Voice } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

class VinylRecordScene extends Scene {
    private music!: AudioStream;
    private musicVoice!: Voice;
    private analyser!: AudioAnalyser;
    private disc!: Graphics;
    private bars!: Graphics;
    private angle = 0;
    private rpm = 0;
    private hud!: ReturnType<typeof mountControls>;
    private tapPrompt!: Text;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.music = this.loader.get(AudioStream, assets.demo.audio.musicLoop);
        this.analyser = new AudioAnalyser({ fftSize: 1024, source: this.app.audio.music });
        this.disc = new Graphics();
        this.bars = new Graphics();

        this.hud = mountControls({
            title: 'Vinyl Record',
            controls: [{ keys: 'Audio', action: 'energy → spin speed' }],
            status: 'Spinning…',
            hint: 'The disc only turns while the track plays — its speed follows live audio energy, so silence keeps it still.',
        });

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — play() returns the Voice now.
        this.musicVoice = this.app.audio.play(this.music, { loop: true, volume: 0.8 });
    }

    override update(delta): void {
        // Spin speed is driven by live audio energy, not a constant fallback BPM.
        // Silence → energy 0 → the platter holds perfectly still.
        const energy = this.analyser.getRms();
        const targetRpm = energy > 0.02 ? 30 + energy * 260 : 0;

        // Ease toward the target so the disc spins up and slows down smoothly.
        this.rpm += (targetRpm - this.rpm) * Math.min(1, delta.seconds * 4);
        this.angle += delta.seconds * (this.rpm / 60) * 360;

        if (this.musicVoice) {
            this.hud.setStatus(`${this.rpm | 0} rpm`);
        }
    }

    override draw(context): void {
        const { width, height } = this.app.canvas;
        const cx = width / 2;
        const cy = height / 2;
        const spectrum = this.analyser.getSpectrum();
        context.backend.clear(new Color(16, 18, 26));
        this.disc.clear();
        this.disc.fillColor = new Color(28, 28, 30);
        this.disc.drawCircle(cx, cy, 150);
        this.disc.fillColor = new Color(220, 90, 90);
        this.disc.drawCircle(cx, cy, 32);
        this.disc.lineWidth = 2;
        this.disc.lineColor = new Color(80, 80, 84);
        for (let r = 45; r <= 140; r += 14) this.disc.drawArc(cx, cy, r, 0, Math.PI * 2);

        // A groove marker so the rotation is visible even on a smooth disc.
        const markerAngle = (this.angle * Math.PI) / 180;
        this.disc.lineWidth = 4;
        this.disc.lineColor = new Color(240, 240, 245);
        this.disc.drawLine(cx, cy, cx + Math.cos(markerAngle) * 140, cy + Math.sin(markerAngle) * 140);
        context.render(this.disc);

        this.bars.clear();
        for (let i = 0; i < 36; i++) {
            const a = (i / 36) * Math.PI * 2 + (this.angle * Math.PI) / 180;
            const bin = (i * 6) % spectrum.length;
            const len = 20 + (spectrum[bin] / 255) * 55;
            const x0 = cx + Math.cos(a) * 170;
            const y0 = cy + Math.sin(a) * 170;
            const x1 = cx + Math.cos(a) * (170 + len);
            const y1 = cy + Math.sin(a) * (170 + len);
            this.bars.lineWidth = 4;
            this.bars.lineColor = new Color(120, 200, 255);
            this.bars.drawLine(x0, y0, x1, y1);
        }
        context.render(this.bars);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new VinylRecordScene());
