// Auto-generated from frequency-bands.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Graphics, Scene, Text } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';
// Eight perceptual frequency bands spanning the audible range, from the lowest
// rumble to the airy top end. The FFT bins are linearly spaced over 0..nyquist,
// so bucketing them onto log-spaced edges gives each band an equal share of the
// frequency *octaves* — the way the ear hears it — instead of cramming the bass
// into two bins and the treble into hundreds.
const BAND_LABELS = ['Sub-bass', 'Bass', 'Low-mid', 'Mid', 'Upper-mid', 'Presence', 'Treble', 'Brilliance'];
const BAND_COUNT = BAND_LABELS.length;
// Warm-to-cool ramp so the spectrum reads left (low) to right (high).
const BAND_COLORS = [
    new Color(255, 92, 92),
    new Color(255, 142, 84),
    new Color(255, 198, 88),
    new Color(186, 230, 96),
    new Color(108, 224, 150),
    new Color(96, 214, 224),
    new Color(118, 168, 255),
    new Color(176, 140, 255),
];
class FrequencyBandsScene extends Scene {
    music;
    analyser;
    bars;
    labels = [];
    bandEdges = [];
    levels = new Array(BAND_COUNT).fill(0);
    hud;
    tapPrompt;
    async init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        // AudioStream has no seamless adapter — await it explicitly.
        const track = await this.loader.load(Asset.kind('music', 'audio/demo-loop-main.ogg'));
        this.music = track;
        this.analyser = new AudioAnalyser({ fftSize: 2048, smoothingTimeConstant: 0.75 });
        this.analyser.source = app.audio.music;
        // Log-spaced bin boundaries across the spectrum. Index 0 (DC) is skipped
        // so the lowest band starts at the first meaningful bin.
        const binCount = this.analyser.frequencyBinCount;
        const minBin = 1;
        const maxBin = binCount;
        for (let i = 0; i <= BAND_COUNT; i++) {
            const t = i / BAND_COUNT;
            this.bandEdges.push(Math.round(minBin * Math.pow(maxBin / minBin, t)));
        }
        this.bars = new Graphics();
        const { width, height } = app.canvas;
        const gap = 16;
        const slotWidth = (width - gap) / BAND_COUNT;
        const barWidth = slotWidth - gap;
        for (let i = 0; i < BAND_COUNT; i++) {
            const label = new Text(BAND_LABELS[i], { fillColor: new Color(190, 198, 214), fontSize: 14 });
            label.setAnchor(0.5, 0);
            label.setPosition(gap + slotWidth * i + barWidth / 2, height * 0.78 + 14);
            this.labels.push(label);
        }
        this.hud = mountControls({
            title: 'Frequency Bands',
            status: 'Analysing spectrum…',
            hint: 'Eight log-spaced bands from sub-bass to brilliance, driven by AudioAnalyser.getSpectrum().',
        });
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically.
        app.audio.play(this.music, { loop: true, volume: 0.8 });
    }
    update() {
        const spectrum = this.analyser.getSpectrum();
        for (let band = 0; band < BAND_COUNT; band++) {
            const start = this.bandEdges[band];
            const end = Math.max(start + 1, this.bandEdges[band + 1]);
            let sum = 0;
            for (let bin = start; bin < end; bin++) {
                sum += spectrum[bin];
            }
            // Mean magnitude of the band, normalised 0..1 (byte spectrum is 0..255).
            this.levels[band] = sum / ((end - start) * 255);
        }
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        context.backend.clear();
        const { width, height } = app.canvas;
        const gap = 16;
        const slotWidth = (width - gap) / BAND_COUNT;
        const barWidth = slotWidth - gap;
        const baseY = height * 0.78;
        const maxHeight = height * 0.62;
        this.bars.clear();
        for (let i = 0; i < BAND_COUNT; i++) {
            const x = gap + slotWidth * i;
            // Track behind each bar so silent bands still read as empty meters.
            this.bars.fillColor = new Color(36, 40, 52);
            this.bars.drawRectangle(x, baseY, barWidth, -maxHeight);
            this.bars.fillColor = BAND_COLORS[i];
            this.bars.drawRectangle(x, baseY, barWidth, -maxHeight * this.levels[i]);
        }
        context.render(this.bars);
        for (const label of this.labels) {
            context.render(label);
        }
        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
const app = new Application({
    scenes: { FrequencyBandsScene },
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
app.start(FrequencyBandsScene);
