import { Application, Color, Graphics, Keyboard, Scene, Sound, Text } from '@codexo/exojs';
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

const DETUNE_RANGE = 200; // ± cents
const FIRE_INTERVAL = 0.08;

class RandomPitchPoolScene extends Scene {
    private sound!: Sound;
    private graphics!: Graphics;
    private label!: Text;
    private readout!: Text;
    private tapPrompt!: Text;
    private active = false;
    private timer = 0;
    private lastCents = 0;
    private flash = 0;
    // Canvas-relative track geometry computed in init().
    private centerX = 0;
    private trackY = 0;
    private trackHalf = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { blip: assets.demo.audio.impactLight });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.centerX = width / 2;
        this.trackY = height * 0.55;
        this.trackHalf = width * 0.38;

        this.sound = loader.get(Sound, 'blip');
        this.sound.poolSize = 20;

        this.graphics = new Graphics();
        this.label = new Text('Hold Space to retrigger with a random pitch', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height * 0.3);
        this.readout = new Text('', { fillColor: Color.white, fontSize: 18, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, this.trackY + 80);

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it. Holding Space becomes audible once
        // a pointer gesture has unlocked the AudioContext.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        this.hud = mountControls({
            title: 'Random Pitch Pool',
            controls: [
                { keys: 'Click', action: 'enable audio (once)' },
                { keys: 'Space', action: 'hold to fire blips at randomised pitch' },
            ],
            status: 'Click or press any key to enable audio, then hold Space.',
            hint: `Each shot detunes by ±${DETUNE_RANGE} cents, so repeated hits never sound identical. The marker shows the latest detune.`,
        });

        this.inputs.onActive(Keyboard.Space, () => {
            this.active = true;
        });
        this.inputs.onStop(Keyboard.Space, () => {
            this.active = false;
        });
    }

    override update(delta): void {
        this.flash = Math.max(0, this.flash - delta.seconds * 4);

        // Core defers playback until the AudioContext unlocks on the first
        // gesture; skip firing while audio is still locked.
        if (!this.active || this.app.audio.locked) return;

        this.timer += delta.seconds;
        while (this.timer > FIRE_INTERVAL) {
            this.timer -= FIRE_INTERVAL;
            this.lastCents = Math.random() * (DETUNE_RANGE * 2) - DETUNE_RANGE;
            this.flash = 1;
            this.sound.play({ playbackRate: Math.pow(2, this.lastCents / 1200) });
        }
    }

    override draw(context): void {
        context.backend.clear();
        this.graphics.clear();

        // Centre baseline.
        this.graphics.fillColor = new Color(60, 60, 70);
        this.graphics.drawRectangle(this.centerX - this.trackHalf, this.trackY - 2, this.trackHalf * 2, 4);
        this.graphics.fillColor = new Color(110, 110, 130);
        this.graphics.drawRectangle(this.centerX - 1, this.trackY - 16, 2, 32);

        // Marker for the latest detune, mapped across the track.
        const markerX = this.centerX + (this.lastCents / DETUNE_RANGE) * this.trackHalf;
        const intensity = 120 + Math.round(135 * this.flash);
        this.graphics.fillColor = new Color(intensity, 255 - Math.round(60 * this.flash), 160);
        this.graphics.drawRectangle(markerX - 6, this.trackY - 26, 12, 52);

        this.readout.text = `Last detune: ${this.lastCents >= 0 ? '+' : ''}${this.lastCents.toFixed(0)} cents`;

        context.render(this.graphics);
        context.render(this.label);
        context.render(this.readout);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new RandomPitchPoolScene());
