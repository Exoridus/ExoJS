import { Application, Color, Graphics, Keyboard, type RenderingContext, Scene, type Sound, Text, type Time } from '@codexo/exojs';
import { ConvolutionEffect } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';

// Every impulse response in the AK-SROOMS set, shortest tail first. The
// duration is what actually decides the character: a few milliseconds only
// colours the sound, ~30-150 ms reads as a cupboard or a shaft, and past
// ~250 ms you start hearing a room you could walk around in.
const ROOMS = [
    { file: 'AK-SROOMS_014', ms: 1 },
    { file: 'AK-SROOMS_013', ms: 2 },
    { file: 'AK-SROOMS_023', ms: 3 },
    { file: 'AK-SROOMS_012', ms: 6 },
    { file: 'AK-SROOMS_011', ms: 11 },
    { file: 'AK-SROOMS_022', ms: 15 },
    { file: 'AK-SROOMS_002', ms: 20 },
    { file: 'AK-SROOMS_003', ms: 20 },
    { file: 'AK-SROOMS_010', ms: 28 },
    { file: 'AK-SROOMS_021', ms: 33 },
    { file: 'AK-SROOMS_009', ms: 48 },
    { file: 'AK-SROOMS_019', ms: 51 },
    { file: 'AK-SROOMS_020', ms: 95 },
    { file: 'AK-SROOMS_006', ms: 133 },
    { file: 'AK-SROOMS_018', ms: 156 },
    { file: 'AK-SROOMS_015', ms: 235 },
    { file: 'AK-SROOMS_001', ms: 236 },
    { file: 'AK-SROOMS_024', ms: 226 },
    { file: 'AK-SROOMS_026', ms: 226 },
    { file: 'AK-SROOMS_027', ms: 226 },
    { file: 'AK-SROOMS_025', ms: 229 },
    { file: 'AK-SROOMS_030', ms: 267 },
    { file: 'AK-SROOMS_004', ms: 307 },
    { file: 'AK-SROOMS_005', ms: 307 },
    { file: 'AK-SROOMS_029', ms: 308 },
    { file: 'AK-SROOMS_007', ms: 350 },
    { file: 'AK-SROOMS_008', ms: 350 },
    { file: 'AK-SROOMS_028', ms: 353 },
    { file: 'AK-SROOMS_017', ms: 550 },
    { file: 'AK-SROOMS_016', ms: 593 },
] as const;

/** Rough label for a tail length - the same intuition a level designer works with. */
function character(ms: number): string {
    if (ms < 10) return 'colouration only';
    if (ms < 40) return 'tight box';
    if (ms < 120) return 'narrow shaft';
    if (ms < 250) return 'small room';
    if (ms < 400) return 'chamber';
    return 'cavern';
}

class ConvolutionRoomsScene extends Scene {
    private impact!: Sound;
    private convolution!: ConvolutionEffect;
    private index = 0;
    private gfx!: Graphics;
    private label!: Text;
    private detail!: Text;
    private tapPrompt!: Text;
    private flash = 0;
    private pad = { x: 0, y: 0, w: 0, h: 0 };
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const { width, height } = this.app;

        this.pad = { x: width / 2 - 240, y: height * 0.34, w: 480, h: 150 };
        this.impact = this.loader.get('audio/impact-light.ogg');

        // No impulse yet - the effect passes audio through untouched until one
        // is set, so it is safe on the bus from the start.
        this.convolution = new ConvolutionEffect({ wet: 0.85 });
        this.app.audio.sound.addEffect(this.convolution);

        this.gfx = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 26 })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, this.pad.y + this.pad.h / 2 - 14);
        this.detail = new Text('', { fillColor: new Color(178, 191, 217), fontSize: 18 })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, this.pad.y + this.pad.h / 2 + 22);
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22 })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);

        this.hud = mountControls({
            title: 'Convolution rooms',
            controls: [
                { keys: 'Click', action: 'fire the impact through the current room' },
                { keys: '← / →', action: 'previous / next impulse response' },
            ],
            status: 'Click or press any key to start…',
            hint: 'Same dry impact every time — only the impulse response changes.',
        });

        this.inputs.onTrigger(Keyboard.Right, () => this.select(this.index + 1));
        this.inputs.onTrigger(Keyboard.Left, () => this.select(this.index - 1));
        this.app.input.onPointerTap.add(() => this.strike());

        this.root.addChild(this.gfx, this.label, this.detail, this.tapPrompt);
        this.select(0);
    }

    /** Swap the impulse response. The handle heals in place, so the effect picks it up once decoded. */
    private select(next: number): void {
        this.index = (next + ROOMS.length) % ROOMS.length;

        const room = ROOMS[this.index]!;
        const ir = this.loader.get(`audio/ir/${room.file}.wav`);

        this.label.text = `${this.index + 1} / ${ROOMS.length} — ${character(room.ms)}`;
        this.detail.text = `${room.file} · ${room.ms} ms tail`;

        // `.loaded` resolves immediately for an already-decoded handle; the
        // effect stays on the previous IR until the new one is ready.
        void ir.loaded.then(() => {
            if (ROOMS[this.index]?.file === room.file) {
                this.convolution.setImpulse(ir);
            }
        });
    }

    private strike(): void {
        if (this.app.audio.locked) {
            return;
        }

        this.app.audio.play(this.impact);
        this.flash = 1;
    }

    override update(time: Time): void {
        this.flash = Math.max(0, this.flash - time.seconds * 3);
        this.tapPrompt.visible = this.app.audio.locked;
        this.hud.setStatus(this.app.audio.locked ? 'Click or press any key to start…' : `Room ${this.index + 1} of ${ROOMS.length}`);

        const { x, y, w, h } = this.pad;

        const lit = Math.floor(40 + this.flash * 150);

        this.gfx.clear();
        this.gfx.fillColor = new Color(lit, lit, Math.floor(70 + this.flash * 110));
        this.gfx.drawRectangle(x, y, w, h);
    }

    override draw(context: RenderingContext): void {
        context.render(this.root);
    }
}

const application = new Application({
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

void application.start(ConvolutionRoomsScene);
