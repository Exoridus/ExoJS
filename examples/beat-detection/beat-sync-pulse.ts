import { Application, Asset, Assets, AudioStream, Color, type RenderingContext, Scene, Sprite, Text, type Time, Vector } from '@codexo/exojs';
import { BeatDetector } from '@codexo/exojs-audio-fx';
import {
    AlphaFadeOverLifetime,
    BurstSpawn,
    ConeDirection,
    Constant,
    particlesExtension,
    ParticleSystem,
} from '@codexo/exojs-particles';
import { mountControlPanel, mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
    extensions: [particlesExtension],
});

class BeatSyncPulseScene extends Scene {
    private music!: AudioStream;
    private detector!: BeatDetector;
    private sprite!: Sprite;
    private pulse = 0;
    private intensity = 0.28;
    private beats = 0;
    private particles!: ParticleSystem;
    private burst!: BurstSpawn;
    private hud!: ReturnType<typeof mountControls>;
    private tapPrompt!: Text;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        // AudioStream has no seamless adapter — await it explicitly.
        const { track } = await this.loader.load(Assets.from({ track: Asset.kind('music', 'audio/demo-loop-main.ogg') }));
        this.music = track;
        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);

        this.hud = mountControls({
            title: 'Beat Sync Pulse',
            hint: 'The ring and particle burst fire on each detected beat.',
        });

        this.particles = new ParticleSystem(this.loader.get('image/particle-light.png'), { capacity: 3500 });
        this.particles.setPosition(width / 2, height / 2);
        this.burst = new BurstSpawn({
            schedule: [{ time: 0, count: 90 }],
            lifetime: new Constant(0.6),
            position: new Constant(new Vector(0, 0)),
            velocity: ConeDirection.omni(80, 240),
            scale: new Constant(new Vector(0.2, 0.2)),
        });
        this.particles.addSpawnModule(this.burst);
        this.particles.addUpdateModule(new AlphaFadeOverLifetime());

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);

        mountControlPanel({ title: 'Tuning' }).addSlider({
            label: 'Pulse intensity',
            min: 0.1,
            max: 0.5,
            step: 0.01,
            value: this.intensity,
            onChange: value => {
                this.intensity = value;
            },
        });

        this.detector = new BeatDetector();
        this.detector.source = app.audio.music;
        this.detector.onBeat.add(() => {
            this.pulse = this.intensity;
            this.burst.reset();
            this.beats += 1;
            this.hud.setStatus(`Beats detected: ${this.beats}`);
        });

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically.
        app.audio.play(this.music, { loop: true, volume: 0.8 });
    }

    override update(delta: Time): void {
        this.pulse = Math.max(0, this.pulse - delta.seconds * 1.2);
        this.sprite.setScale(1 + this.pulse);
        this.particles.update(delta);
    }

    override draw(context: RenderingContext): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        context.backend.clear();
        context.render(this.particles);
        context.render(this.sprite);

        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new BeatSyncPulseScene());
