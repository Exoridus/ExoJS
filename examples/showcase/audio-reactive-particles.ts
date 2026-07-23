import { Application, Asset, AudioStream, Color, type RenderingContext, Scene, Text, type Time, Vector, type Voice } from '@codexo/exojs';
import { AudioAnalyser, BeatDetector } from '@codexo/exojs-audio-fx';
import {
    AlphaFadeOverLifetime,
    ConeDirection,
    Constant,
    particlesExtension,
    ParticleSystem,
    RateSpawn,
} from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';



const colors = [new Color(255, 120, 140), new Color(120, 220, 255), new Color(130, 255, 170), new Color(255, 220, 120)];

class AudioReactiveParticlesScene extends Scene {
    private music!: AudioStream;
    private musicVoice!: Voice;
    private analyser!: AudioAnalyser;
    private detector!: BeatDetector;
    private ps!: ParticleSystem;
    private spawn!: RateSpawn;
    private rate!: Constant<number>;
    private cone!: ConeDirection;
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

        // Two parallel taps of the same track: the analyser gives per-band
        // energy (drives emission), the detector gives beats (recolours).
        this.analyser = new AudioAnalyser({ fftSize: 1024, source: app.audio.music });
        this.detector = new BeatDetector();
        this.detector.source = app.audio.music;

        this.ps = new ParticleSystem(this.loader.get(assets.demo.textures.particleLight), { capacity: 6000 });
        this.systems.add(this.ps);
        this.ps.setPosition(width / 2, height / 2);

        // The rate (density) and the cone speed range (spread) are mutated every
        // frame from live audio energy. Starting both near zero means a silent
        // track emits (almost) nothing — the field is genuinely data-driven, not
        // a timed fountain dressed up as "reactive".
        this.rate = new Constant(0);
        this.cone = ConeDirection.omni(20, 40);
        this.spawn = new RateSpawn({
            rate: this.rate,
            lifetime: new Constant(0.9),
            position: new Constant(new Vector(0, 0)),
            velocity: this.cone,
            scale: new Constant(new Vector(0.22, 0.22)),
            tint: new Constant(colors[0]),
        });
        this.ps.addSpawnModule(this.spawn);
        this.ps.addUpdateModule(new AlphaFadeOverLifetime());

        // Beats only recolour the stream; they do not fake emission on their own.
        this.detector.onBeat.add(() => {
            this.spawn.config.tint = new Constant(colors[(Math.random() * colors.length) | 0]);
        });

        this.hud = mountControls({
            title: 'Audio Reactive Particles',
            controls: [{ keys: 'Audio', action: 'bass → density · treble → spread' }],
            status: 'Listening…',
            hint: 'Density follows low-band energy; spread follows high-band energy. Silence = still.',
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

    override update(_delta: Time): void {
        // Low band (bass) drives how MANY particles spawn this second.
        const low = this.analyser.getBandEnergy(20, 180);
        // High band (treble) drives how WIDE the velocity cone fans out.
        const high = this.analyser.getBandEnergy(2000, 16000);

        // bass → density: 0 in silence, up to ~1200 particles/s on heavy bass.
        this.rate.value = low * low * 1200;

        // treble → spread: a tight slow core grows into a fast wide burst.
        this.cone.minSpeed = 40 + high * 120;
        this.cone.maxSpeed = 90 + high * 360;

        if (this.musicVoice) {
            this.hud.setStatus(`bass ${(low * 100) | 0}%  treble ${(high * 100) | 0}%`);
        }
    }

    override draw(context: RenderingContext): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        context.backend.clear();
        context.render(this.ps);

        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

const app = new Application({
    scenes: { AudioReactiveParticlesScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});

app.start(AudioReactiveParticlesScene);
