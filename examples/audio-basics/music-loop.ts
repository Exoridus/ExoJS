import { Application, AudioStream, Color, Graphics, type Loopable, type Pausable, type RatePitched, Scene, type Seekable, Text, type Voice } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

class MusicLoopScene extends Scene {
    private music!: AudioStream;
    private musicVoice!: Voice & Seekable & Pausable & Loopable & RatePitched;
    private graphics!: Graphics;
    private status!: Text;
    private tapPrompt!: Text;
    // Progress bar geometry, canvas-relative, computed in init().
    private bar = { x: 0, y: 0, w: 0, h: 28 };
    private hud!: ReturnType<typeof mountControls>;
    private panel!: ReturnType<typeof mountControlPanel>;

    override async load(loader): Promise<void> {
        this.music = await loader.load(AudioStream.of(assets.demo.audio.musicLoop));
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        // Wide progress bar centred horizontally on the 16:9 canvas.
        this.bar = { x: width * 0.15, y: height * 0.5, w: width * 0.7, h: 28 };

        // A single streaming track — the browser's media pipeline loops it
        // seamlessly when `loop` is on, so no duplicate/silent track is needed.
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — play() returns the Voice now,
        // and all live control (volume, rate, loop, seek) lives on it.
        this.musicVoice = this.app.audio.play(this.music, { loop: true, volume: 0.7, playbackRate: 1 }) as Voice & Seekable & Pausable & Loopable & RatePitched;

        this.graphics = new Graphics();
        this.status = new Text('', { fillColor: Color.white, fontSize: 18 }).setPosition(this.bar.x, this.bar.y - 36);

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        this.hud = mountControls({
            title: 'Music Loop',
            controls: [{ keys: 'Panel', action: 'adjust volume, playback rate, and looping' }],
            status: 'Click or press any key to start the track…',
            hint: 'The bar shows playback position. With Loop off, the track plays once and stops; turn Loop on to repeat seamlessly.',
        });

        // Real, engine-backed controls over the live music Voice.
        this.panel = mountControlPanel({ title: 'Music', corner: 'bottom-left' });
        this.panel.addSlider({
            label: 'Volume',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.musicVoice.volume,
            onChange: value => (this.musicVoice.volume = value),
        });
        this.panel.addSlider({
            label: 'Playback rate',
            min: 0.5,
            max: 2,
            step: 0.05,
            value: this.musicVoice.playbackRate,
            onChange: value => (this.musicVoice.playbackRate = value),
        });
        this.panel.addToggle({
            label: 'Loop',
            value: this.musicVoice.loop,
            onChange: on => {
                this.musicVoice.loop = on;
                // Re-running off the end: if the track already finished while
                // loop was off, re-enabling and playing restarts it.
                if (on && this.musicVoice.paused) {
                    this.musicVoice.seek(0);
                    this.musicVoice.resume();
                }
            },
        });
        this.panel.addButton({
            label: 'Restart',
            onClick: () => {
                this.musicVoice.seek(0);
                this.musicVoice.resume();
            },
        });

        this.hud.setStatus('Playing — use the panel to mix.');
    }

    override draw(context): void {
        context.backend.clear();
        this.graphics.clear();

        const duration = this.musicVoice.duration;
        const time = this.musicVoice.time;
        // The stream captures its duration from the media element, which is NaN
        // until metadata has loaded. Fall back to a moving marker driven purely
        // by the playback clock when it is unavailable.
        const hasDuration = Number.isFinite(duration) && duration > 0;
        const progress = hasDuration ? Math.max(0, Math.min(1, time / duration)) : (time % 4) / 4;

        const playing = !this.musicVoice.paused && !this.musicVoice.ended;

        // Progress trough + fill.
        this.graphics.fillColor = new Color(45, 50, 60);
        this.graphics.drawRectangle(this.bar.x, this.bar.y, this.bar.w, this.bar.h);
        this.graphics.fillColor = playing ? new Color(120, 200, 255) : new Color(120, 120, 120);
        this.graphics.drawRectangle(this.bar.x, this.bar.y, this.bar.w * progress, this.bar.h);

        const state = playing ? 'Playing' : 'Stopped';
        const position = hasDuration ? `${time.toFixed(1)} / ${duration.toFixed(1)}s` : `${time.toFixed(1)}s`;
        this.status.text = `${state}   ${position}   ${Math.round(this.musicVoice.playbackRate * 100)}% speed   Loop ${this.musicVoice.loop ? 'on' : 'off'}`;

        context.render(this.graphics);
        context.render(this.status);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new MusicLoopScene());
