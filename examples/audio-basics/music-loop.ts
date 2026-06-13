import { Application, Color, Graphics, Music, Scene, Text } from '@codexo/exojs';
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
    private music!: Music;
    private graphics!: Graphics;
    private status!: Text;
    private tapPrompt!: Text;
    // Progress bar geometry, canvas-relative, computed in init().
    private bar = { x: 0, y: 0, w: 0, h: 28 };
    private hud!: ReturnType<typeof mountControls>;
    private panel!: ReturnType<typeof mountControlPanel>;

    override async load(loader): Promise<void> {
        await loader.load(Music, { track: assets.demo.audio.musicLoop });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        // Wide progress bar centred horizontally on the 16:9 canvas.
        this.bar = { x: width * 0.15, y: height * 0.5, w: width * 0.7, h: 28 };

        // A single streaming track — the browser's media pipeline loops it
        // seamlessly when `loop` is on, so no duplicate/silent track is needed.
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.7).setPlaybackRate(1);

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

        // Real, engine-backed controls over the single Music instance.
        this.panel = mountControlPanel({ title: 'Music', corner: 'bottom-left' });
        this.panel.addSlider({
            label: 'Volume',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.music.volume,
            onChange: value => this.music.setVolume(value),
        });
        this.panel.addSlider({
            label: 'Playback rate',
            min: 0.5,
            max: 2,
            step: 0.05,
            value: this.music.playbackRate,
            onChange: value => this.music.setPlaybackRate(value),
        });
        this.panel.addToggle({
            label: 'Loop',
            value: this.music.loop,
            onChange: on => {
                this.music.setLoop(on);
                // Re-running off the end: if the track already finished while
                // loop was off, re-enabling and playing restarts it.
                if (on && this.music.paused) this.music.setTime(0).play();
            },
        });
        this.panel.addButton({
            label: 'Restart',
            onClick: () => this.music.setTime(0).play(),
        });

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — just call play().
        this.music.play();
        this.hud.setStatus('Playing — use the panel to mix.');
    }

    override draw(context): void {
        context.backend.clear();
        this.graphics.clear();

        const duration = this.music.duration;
        const time = this.music.currentTime;
        // Music captures its duration from the media element at construction,
        // before metadata has loaded, so it can be NaN. Fall back to a moving
        // marker driven purely by the playback clock when it is unavailable.
        const hasDuration = Number.isFinite(duration) && duration > 0;
        const progress = hasDuration ? Math.max(0, Math.min(1, time / duration)) : (time % 4) / 4;

        // Progress trough + fill.
        this.graphics.fillColor = new Color(45, 50, 60);
        this.graphics.drawRectangle(this.bar.x, this.bar.y, this.bar.w, this.bar.h);
        this.graphics.fillColor = this.music.playing ? new Color(120, 200, 255) : new Color(120, 120, 120);
        this.graphics.drawRectangle(this.bar.x, this.bar.y, this.bar.w * progress, this.bar.h);

        const state = this.music.playing ? 'Playing' : 'Stopped';
        const position = hasDuration ? `${time.toFixed(1)} / ${duration.toFixed(1)}s` : `${time.toFixed(1)}s`;
        this.status.text = `${state}   ${position}   ${Math.round(this.music.playbackRate * 100)}% speed   Loop ${this.music.loop ? 'on' : 'off'}`;

        context.render(this.graphics);
        context.render(this.status);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new MusicLoopScene());
