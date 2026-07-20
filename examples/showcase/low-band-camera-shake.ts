import { Application, Asset, AudioStream, Color, type RenderingContext, Scene, Sprite, Text, type Time, View, type Voice } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';



class LowBandCameraShakeScene extends Scene {
    private music!: AudioStream;
    private musicVoice!: Voice;
    private analyser!: AudioAnalyser;
    private view!: View;
    private sprite!: Sprite;
    private hud!: ReturnType<typeof mountControls>;
    private tapPrompt!: Text;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        // AudioStream is a non-leaf resource kind (no seamless placeholder), so it
        // is loaded directly through `Asset.kind('music', ...)` and awaited rather
        // than fetched synchronously via `get()`.
        this.music = await this.loader.load(Asset.kind('music', assets.demo.audio.musicLoop));
        this.analyser = new AudioAnalyser({ fftSize: 1024, source: app.audio.music });
        this.view = new View(width / 2, height / 2, width, height);
        this.sprite = new Sprite(this.loader.get(assets.demo.textures.shipA)).setAnchor(0.5).setScale(3).setPosition(width / 2, height / 2);

        this.hud = mountControls({
            title: 'Low Band Camera Shake',
            controls: [{ keys: 'Audio', action: 'low-band energy → shake' }],
            status: 'Listening…',
            hint: 'Shake amplitude tracks bass energy only — in silence the camera is perfectly still.',
        });

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — play() returns the Voice now.
        this.musicVoice = app.audio.play(this.music, { loop: true, volume: 0.8 });
    }

    override update(delta: Time): void {
        const low = this.analyser.getBandEnergy(20, 180);

        // No constant floor: amplitude is purely low-band energy, so a quiet
        // passage produces zero shake. A small deadzone keeps faint noise still.
        const amplitude = low > 0.04 ? low * 28 : 0;
        this.view.shake(amplitude, 90, { decay: true, frequency: 22 });

        // Advance the shake oscillation (the View only animates when updated).
        this.view.update(delta.milliseconds);

        if (this.musicVoice) {
            this.hud.setStatus(`bass ${(low * 100) | 0}%`);
        }
    }

    override draw(context: RenderingContext): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        context.backend.clear(new Color(22, 24, 34));
        context.backend.setView(this.view);
        context.render(this.sprite);
        context.backend.setView(null);

        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

const app = new Application({
    scenes: { LowBandCameraShakeScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

app.start(LowBandCameraShakeScene);
