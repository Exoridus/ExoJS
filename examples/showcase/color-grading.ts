import { Application, Color, Keyboard, LutFilter, type RenderingContext, Scene, Sprite, Texture } from '@codexo/exojs';
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

const LUT_SIZE = 17;

type TransformFn = (r: number, g: number, b: number) => [number, number, number];

function buildLut3D(transform: TransformFn): HTMLCanvasElement {
    const width = LUT_SIZE * LUT_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = LUT_SIZE;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(width, LUT_SIZE);
    const max = LUT_SIZE - 1;
    for (let bIdx = 0; bIdx < LUT_SIZE; bIdx++) {
        for (let g = 0; g < LUT_SIZE; g++) {
            for (let r = 0; r < LUT_SIZE; r++) {
                const out = transform(r / max, g / max, bIdx / max);
                const x = bIdx * LUT_SIZE + r;
                const o = (g * width + x) * 4;
                image.data[o] = Math.round(out[0] * 255);
                image.data[o + 1] = Math.round(out[1] * 255);
                image.data[o + 2] = Math.round(out[2] * 255);
                image.data[o + 3] = 255;
            }
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

// The five named graded looks from the catalog, followed by an explicit pass-
// through baseline so a viewer can compare each grade against the ungraded
// source. The baseline is labelled "Identity (off)" so it is never mistaken for
// a sixth creative look.
const LOOKS = [
    {
        name: 'Sepia',
        transform: (r: number, g: number, b: number): [number, number, number] => {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            return [Math.min(1, lum * 1.2), Math.min(1, lum * 1.0), Math.min(1, lum * 0.6)];
        },
    },
    {
        name: 'Cool Cinematic',
        transform: (r: number, g: number, b: number): [number, number, number] => [r * 0.85, g * 0.95, Math.min(1, b * 1.15 + 0.05)],
    },
    {
        name: 'Warm Sunset',
        transform: (r: number, g: number, b: number): [number, number, number] => [Math.min(1, r * 1.15 + 0.05), g * 0.95, b * 0.75],
    },
    {
        name: 'Bleach Bypass',
        transform: (r: number, g: number, b: number): [number, number, number] => {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            return [Math.min(1, r * 0.6 + lum * 0.6), Math.min(1, g * 0.6 + lum * 0.6), Math.min(1, b * 0.6 + lum * 0.6)];
        },
    },
    {
        name: 'Protanopia (red-blind)',
        transform: (r: number, g: number, b: number): [number, number, number] => [0.567 * r + 0.433 * g, 0.558 * r + 0.442 * g, 0.242 * g + 0.758 * b],
    },
    { name: 'Identity (off)', transform: (r: number, g: number, b: number): [number, number, number] => [r, g, b] },
];

const PRIMARY_RAMP = assets.technical.color.primaryRamp;

class ColorGradingScene extends Scene {
    private luts!: Texture[];
    private filter!: LutFilter;
    private index = 0;
    private sprite!: Sprite;
    private hud!: ReturnType<typeof mountControls>;
    private cycle!: { set(value: number): void };

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.luts = LOOKS.map(look => LutFilter.fromImage(buildLut3D(look.transform)));
        this.filter = new LutFilter({ mode: '3d', size: LUT_SIZE }).setLut(this.luts[0]);

        this.sprite = new Sprite(this.loader.get(PRIMARY_RAMP)).setAnchor(0.5).setScale(3.5);
        this.sprite.setPosition(width / 2, height / 2);
        this.sprite.filters = [this.filter];

        this.hud = mountControls({
            title: 'Color Grading',
            controls: [
                { keys: 'SPACE', action: 'next look' },
                { keys: 'Look', action: 'pick a grade' },
            ],
        });

        this.cycle = mountControlPanel({ title: 'LUT' }).addCycle({
            label: 'Look',
            options: LOOKS.map(look => look.name),
            index: 0,
            onChange: index => this.setIndex(index),
        });

        this.inputs.onTrigger(Keyboard.Space, () => this.setIndex((this.index + 1) % LOOKS.length));

        // Apply the initial look so the HUD and sprite agree from frame one.
        this.applyLook();
    }

    private setIndex(index: number): void {
        this.index = ((index % LOOKS.length) + LOOKS.length) % LOOKS.length;
        this.applyLook();
    }

    private applyLook(): void {
        this.filter.setLut(this.luts[this.index]);
        this.cycle.set(this.index);
        this.hud.setStatus(`${LOOKS[this.index].name}  (${this.index + 1}/${LOOKS.length})`);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new ColorGradingScene());
