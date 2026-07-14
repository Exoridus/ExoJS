// Auto-generated from audio-visualisation.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Scene, Sprite, Text, Texture } from '@codexo/exojs';
import { AudioAnalyser, BeatDetector } from '@codexo/exojs-audio-fx';
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
class AudioVisualisationScene extends Scene {
    music;
    musicVoice;
    analyser;
    detector;
    canvas;
    context;
    gradientStyle;
    progressStyle = 'rgba(255, 255, 255, 0.1)';
    texture;
    screen;
    hud;
    tapPrompt;
    async init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        // AudioStream is a non-leaf resource kind (no seamless placeholder), so it
        // is loaded directly through `Asset.kind('music', ...)` and awaited rather
        // than fetched synchronously via `get()`.
        this.music = await this.loader.load(Asset.kind('music', assets.demo.audio.musicLoop));
        // One analyser tap for spectrum/waveform, one beat detector for the
        // beat-pulse ring. Both read the music bus the stream plays through,
        // without altering playback.
        this.analyser = new AudioAnalyser({ source: app.audio.music });
        this.detector = new BeatDetector();
        this.detector.source = app.audio.music;
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '12.5%';
        this.canvas.style.left = '0';
        this.canvas.width = width;
        this.canvas.height = height;
        this.context = this.canvas.getContext('2d');
        this.context.strokeStyle = '#fff';
        this.context.lineWidth = 4;
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';
        this.gradientStyle = this.context.createLinearGradient(0, 0, 0, this.canvas.height);
        this.gradientStyle.addColorStop(0, '#f70');
        this.gradientStyle.addColorStop(0.5, '#f30');
        this.gradientStyle.addColorStop(1, '#f70');
        this.texture = new Texture(this.canvas);
        this.screen = new Sprite(this.texture);
        this.hud = mountControls({
            title: 'Audio Visualisation',
            controls: [{ keys: 'Click', action: 'play / pause' }],
            status: 'Playing…',
            hint: 'Frequency bars, waveform, and a beat-pulse ring — all driven by live AudioAnalyser + BeatDetector data.',
        });
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);
        app.input.onPointerDown.add(() => {
            // The first gesture only unlocks audio (core auto-starts the queued
            // track); subsequent clicks toggle play / pause.
            if (app.audio.locked) {
                return;
            }
            if (this.musicVoice.paused) {
                this.musicVoice.resume();
            }
            else {
                this.musicVoice.pause();
            }
            this.hud.setStatus(this.musicVoice.paused ? 'Paused' : 'Playing…');
        });
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — play() returns the Voice now.
        this.musicVoice = app.audio.play(this.music, { loop: true, volume: 0.8 });
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const canvas = this.canvas;
        const freqData = this.analyser.getSpectrum();
        const timeDomain = this.analyser.getWaveform();
        const width = canvas.width;
        const height = canvas.height;
        const length = freqData.length;
        const barWidth = Math.ceil(width / length);
        this.context.clearRect(0, 0, width, height);
        // Progress bar of the looping track.
        const progress = this.musicVoice.duration > 0 ? this.musicVoice.time / this.musicVoice.duration : 0;
        this.context.fillStyle = this.progressStyle;
        this.context.fillRect(0, 0, width * progress, height);
        // Frequency bars + waveform polyline.
        this.context.fillStyle = this.gradientStyle;
        this.context.beginPath();
        for (let i = 0; i < length; i++) {
            const barHeight = (height * freqData[i]) / 255;
            const lineHeight = (height * timeDomain[i]) / 255;
            const offsetX = (i * barWidth) | 0;
            this.context.fillRect(offsetX, (height / 2 - barHeight / 2) | 0, barWidth, barHeight | 0);
            this.context.lineTo(offsetX, (height * 0.75 - lineHeight / 2) | 0);
        }
        this.context.stroke();
        // Beat-pulse ring: radius and opacity follow the detector's beat
        // envelope, so it expands on every beat and sits perfectly still in
        // silence (pulse is 0 until a tempo locks).
        const pulse = this.detector.pulse;
        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.18;
        const radius = baseRadius * (1 + pulse * 0.6);
        this.context.beginPath();
        this.context.arc(cx, cy, radius, 0, Math.PI * 2);
        this.context.lineWidth = 6 + pulse * 10;
        this.context.strokeStyle = `rgba(120, 220, 255, ${0.15 + pulse * 0.7})`;
        this.context.stroke();
        // restore the default stroke style for the next frame's waveform.
        this.context.strokeStyle = '#fff';
        this.context.lineWidth = 4;
        this.screen.updateTexture();
        context.backend.clear();
        context.render(this.screen);
        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new AudioVisualisationScene());
