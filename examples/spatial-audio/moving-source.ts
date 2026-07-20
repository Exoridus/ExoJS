import { Application, Asset, Color, Graphics, Scene, Sound, Text } from '@codexo/exojs';
import type { RenderingContext, Spatializable, Time, Voice } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

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
});

// Orbit + attenuation tuned to the wide canvas so the readout reflects what you
// hear.
const ORBIT_X = 420;
const ORBIT_Y = 220;
const REF_DISTANCE = 50;
const MAX_DISTANCE = 520;

function linearAttenuation(distance: number): number {
    if (distance <= REF_DISTANCE) return 1;
    const t = (distance - REF_DISTANCE) / (MAX_DISTANCE - REF_DISTANCE);
    return Math.max(0, 1 - t);
}

class MovingSourceScene extends Scene {
    private sound!: Sound;
    private voice!: Voice & Spatializable;
    private listener!: { x: number; y: number };
    private angle = 0;
    private graphics!: Graphics;
    private label!: Text;
    private tapPrompt!: Text;
    private hud!: ReturnType<typeof mountControls>;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        // A continuous music loop, not a one-shot: spatialization is only
        // audible while there is sustained signal to pan/attenuate. The derived
        // Sound below reads .audioBuffer synchronously, so await load() instead
        // of the deferred get() (whose placeholder audioBuffer is null until fill).
        const source = await this.loader.load(Asset.kind('sound', 'audio/demo-loop-main.ogg'));
        this.sound = new Sound(source.audioBuffer);
        this.listener = { x: width / 2, y: height / 2 };
        app.audio.listener.target = this.listener;
        this.angle = 0;

        this.graphics = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 17 });
        this.label.setPosition(20, 20);

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued loop starts.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        this.hud = mountControls({
            title: 'Moving Source',
            status: 'Click or press any key to start…',
            hint: 'The source orbits the listener automatically — listen for it sweeping left to right.',
        });

        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — just call play().
        // play() returns the narrow Voice interface; Sound voices are spatializable.
        this.voice = app.audio.play(this.sound, {
            loop: true,
            volume: 1,
            position: { x: this.listener.x + ORBIT_X, y: this.listener.y },
            distanceModel: 'linear',
            refDistance: REF_DISTANCE,
            maxDistance: MAX_DISTANCE,
            rolloffFactor: 1,
        }) as Voice & Spatializable;
        this.hud.setStatus('Source orbiting the listener');
    }

    override update(delta: Time): void {
        this.angle += delta.seconds * 1.1;
        const position = {
            x: this.listener.x + Math.cos(this.angle) * ORBIT_X,
            y: this.listener.y + Math.sin(this.angle) * ORBIT_Y,
        };
        this.voice.position = position;
    }

    override draw(context: RenderingContext): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const source = this.voice.position ?? { x: 0, y: 0 };
        const dx = source.x - this.listener.x;
        const dy = source.y - this.listener.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const volume = linearAttenuation(dist);
        const pan = Math.max(-1, Math.min(1, dx / ORBIT_X));
        const panText = pan < -0.05 ? `L ${Math.abs(pan).toFixed(2)}` : pan > 0.05 ? `R ${pan.toFixed(2)}` : 'center';
        this.label.text = `distance: ${dist.toFixed(0)} px   volume: ${(volume * 100).toFixed(0)}%   pan: ${panText}`;

        context.backend.clear();
        this.graphics.clear();

        // Orbit path.
        this.graphics.fillColor = new Color(40, 50, 55);
        this.graphics.drawEllipse(this.listener.x, this.listener.y, ORBIT_X, ORBIT_Y);
        this.graphics.fillColor = new Color(0, 0, 0);
        this.graphics.drawEllipse(this.listener.x, this.listener.y, ORBIT_X - 2, ORBIT_Y - 2);

        // Listener.
        this.graphics.fillColor = new Color(120, 255, 160);
        this.graphics.drawCircle(this.listener.x, this.listener.y, 12);

        // Source — brightness tracks attenuation.
        const glow = Math.floor(90 + volume * 165);
        this.graphics.fillColor = new Color(glow, Math.floor(90 + volume * 60), Math.floor(80 + volume * 40));
        this.graphics.drawCircle(source.x, source.y, 16);

        context.render(this.graphics);
        context.render(this.label);

        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new MovingSourceScene());
