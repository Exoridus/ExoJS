import { Application, BeatDetector, Color, Graphics, Music, Scene, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(14, 16, 22),
    loader: {
        basePath: 'assets/',
    },
});

class TempoTrackingScene extends Scene {
    private music!: Music;
    private detector!: BeatDetector;
    private readout!: Text;
    private confidenceLabel!: Text;
    private onsetLabel!: Text;
    private bars!: Graphics;
    private onset = 0;
    // Auto-gain reference for the onset bar: spectral flux has no fixed ceiling,
    // so we normalise against the loudest recent onset and let it decay back.
    private onsetPeak = 0.001;
    private hud!: ReturnType<typeof mountControls>;
    private tapPrompt!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Music, { track: 'audio/demo-loop-main.ogg' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;
        const marginX = width * 0.08;

        this.music = loader.get(Music, 'track');

        this.detector = new BeatDetector();
        this.detector.source = this.music;

        this.readout = new Text('BPM —', { fillColor: Color.white, fontSize: 40 });
        this.readout.setPosition(marginX, height * 0.18);

        this.confidenceLabel = new Text('Confidence', { fillColor: new Color(150, 220, 175), fontSize: 20 });
        this.confidenceLabel.setPosition(marginX, height * 0.42);

        this.onsetLabel = new Text('Onset energy', { fillColor: new Color(120, 200, 255), fontSize: 20 });
        this.onsetLabel.setPosition(marginX, height * 0.62);

        this.bars = new Graphics();

        this.hud = mountControls({
            title: 'Tempo Tracking',
            status: 'Tracking tempo…',
            hint: 'Estimated BPM and confidence from BeatDetector, alongside its raw onset energy (spectral flux).',
        });

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — just call play().
        this.music.setLoop(true).setVolume(0.8).play();
    }

    override update(delta): void {
        // Raw onset strength straight from the detector (positive spectral flux).
        this.onset = this.detector.onsetStrength;

        // Follow the loudest recent onset for the auto-gain reference, then bleed
        // it off so the bar stays responsive as the material changes.
        this.onsetPeak = Math.max(this.onset, this.onsetPeak * (1 - delta.seconds * 0.4));
    }

    override draw(context): void {
        const bpm = this.detector.tempo;
        const confidence = this.detector.confidence;
        const onsetNorm = Math.min(1, this.onset / this.onsetPeak);

        this.readout.text = bpm > 0 ? `BPM ${bpm.toFixed(1)}` : 'BPM —  (listening…)';
        this.confidenceLabel.text = `Confidence  ${confidence.toFixed(2)}`;
        this.onsetLabel.text = `Onset energy  ${this.onset.toFixed(2)}`;

        const { width, height } = this.app.canvas;
        const marginX = width * 0.08;
        const meterWidth = width - marginX * 2;
        const meterHeight = 30;
        const confidenceY = height * 0.42 + 36;
        const onsetY = height * 0.62 + 36;

        context.backend.clear();

        this.bars.clear();

        // Confidence meter.
        this.bars.fillColor = new Color(40, 44, 56);
        this.bars.drawRectangle(marginX, confidenceY, meterWidth, meterHeight);
        this.bars.fillColor = new Color(120, 220, 150);
        this.bars.drawRectangle(marginX, confidenceY, meterWidth * confidence, meterHeight);

        // Onset-energy meter.
        this.bars.fillColor = new Color(40, 44, 56);
        this.bars.drawRectangle(marginX, onsetY, meterWidth, meterHeight);
        this.bars.fillColor = new Color(96, 180, 255);
        this.bars.drawRectangle(marginX, onsetY, meterWidth * onsetNorm, meterHeight);

        context.render(this.bars);
        context.render(this.readout);
        context.render(this.confidenceLabel);
        context.render(this.onsetLabel);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new TempoTrackingScene());
