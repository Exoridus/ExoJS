import { Application, AudioStream, BeatDetector, Color, Scene, Sprite, Text, Texture, Vector } from '@codexo/exojs';
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

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png', particle: 'image/particle-light.png' });
        await loader.load(AudioStream, { track: 'audio/demo-loop-main.ogg' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.music = loader.get(AudioStream, 'track');
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(width / 2, height / 2);

        this.hud = mountControls({
            title: 'Beat Sync Pulse',
            hint: 'The ring and particle burst fire on each detected beat.',
        });

        this.particles = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 3500 });
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
        this.detector.source = this.app.audio.music;
        this.detector.onBeat.add(() => {
            this.pulse = this.intensity;
            this.burst.reset();
            this.beats += 1;
            this.hud.setStatus(`Beats detected: ${this.beats}`);
        });

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically.
        this.app.audio.play(this.music, { loop: true, volume: 0.8 });
    }

    override update(delta): void {
        this.pulse = Math.max(0, this.pulse - delta.seconds * 1.2);
        this.sprite.setScale(1 + this.pulse);
        this.particles.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.particles);
        context.render(this.sprite);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new BeatSyncPulseScene());
