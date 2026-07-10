import { Application, Color, Graphics, Scene, Sound, Text } from '@codexo/exojs';
import { DelayEffect, ReverbEffect } from '@codexo/exojs-audio-fx';
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
});

class ReverbAndDelayScene extends Scene {
    private sound!: Sound;
    private reverb!: ReverbEffect;
    private delay!: DelayEffect;
    private gfx!: Graphics;
    private prompt!: Text;
    private tapPrompt!: Text;
    private flash = 0;
    private triggers = 0;
    // Canvas-relative click-pad geometry computed in init().
    private pad = { x: 0, y: 0, w: 0, h: 0 };
    private hud!: ReturnType<typeof mountControls>;
    private panel!: ReturnType<typeof mountControlPanel>;

    override init(): void {
        const { width, height } = this.app.canvas;

        // A large click pad centred on the canvas.
        this.pad = { x: width / 2 - 240, y: height * 0.36, w: 480, h: 160 };

        // Path-only get() infers Sound from the .ogg extension — sidesteps a
        // compile-time overload ambiguity between Sound and the Json token form
        // when passing the Sound token explicitly.
        this.sound = this.loader.get('audio/impact-light.ogg');

        // Reverb (room tail) → Delay (echoes) chained on the sound bus.
        this.reverb = new ReverbEffect({ wet: 0.4, decay: 2 });
        this.delay = new DelayEffect({ wet: 0.35, delaySeconds: 0.25, feedback: 0.45 });
        app.audio.sound.addEffect(this.reverb);
        app.audio.sound.addEffect(this.delay);

        this.gfx = new Graphics();
        this.prompt = new Text('', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, this.pad.y + this.pad.h / 2);

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        this.hud = mountControls({
            title: 'Reverb and Delay',
            controls: [{ keys: 'Click', action: 'trigger the impact sound' }],
            status: 'Click or press any key to start…',
            hint: 'Each click fires the dry impact through the reverb tail and delay echoes.',
        });

        // All four effect parameters are live: reverb wet + decay, delay wet,
        // delay time + feedback. Ranges mirror the filter clamps in src/audio/filters.
        this.panel = mountControlPanel({ title: 'Effect chain', corner: 'bottom-left' });
        this.panel.addSlider({
            label: 'Reverb wet',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.reverb.wet,
            onChange: v => {
                this.reverb.wet = v;
            },
        });
        this.panel.addSlider({
            label: 'Reverb decay',
            min: 0.5,
            max: 10,
            step: 0.1,
            value: this.reverb.decay,
            onChange: v => {
                this.reverb.decay = v;
            },
        });
        this.panel.addSlider({
            label: 'Delay wet',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.delay.wet,
            onChange: v => {
                this.delay.wet = v;
            },
        });
        this.panel.addSlider({
            label: 'Delay time (s)',
            min: 0.02,
            max: 0.82,
            step: 0.01,
            value: this.delay.delaySeconds,
            onChange: v => {
                this.delay.delaySeconds = v;
            },
        });
        this.panel.addSlider({
            label: 'Delay feedback',
            min: 0,
            max: 0.95,
            step: 0.01,
            value: this.delay.feedback,
            onChange: v => {
                this.delay.feedback = v;
            },
        });

        this.app.input.onPointerTap.add(() => {
            // The pointer gesture also unlocks the AudioContext; firing while
            // still locked would be silent, so wait until audio is ready.
            if (this.app.audio.locked) return;
            this.app.audio.play(this.sound);
            this.flash = 1;
            this.triggers += 1;
            this.hud.setStatus(`Impacts triggered: ${this.triggers}`);
        });

        this.hud.setStatus('Click anywhere to trigger the impact');
    }

    override update(delta): void {
        this.flash = Math.max(0, this.flash - delta.seconds * 2.2);
    }

    override draw(context): void {
        context.backend.clear();
        this.gfx.clear();

        // A big click pad that flashes on each trigger so the play action reads.
        const lit = Math.floor(60 + this.flash * 180);
        this.gfx.fillColor = new Color(lit, lit, Math.floor(60 + this.flash * 120));
        this.gfx.drawRectangle(this.pad.x, this.pad.y, this.pad.w, this.pad.h);

        this.prompt.text = this.app.audio.locked ? 'Click or press a key to enable audio' : 'Click to play impact';
        context.render(this.gfx);
        context.render(this.prompt);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new ReverbAndDelayScene());
