import { Application, Color, Keyboard, LutFilter, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

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

const LOOKS = [
    { name: 'Identity', transform: (r: number, g: number, b: number): [number, number, number] => [r, g, b] },
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
];

const PRIMARY_RAMP = assets.technical.color.primaryRamp;

class ColorGradingScene extends Scene {
    private luts!: Texture[];
    private filter!: LutFilter;
    private index = 0;
    private sprite!: Sprite;
    private label!: Text;
    private hint!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { ramp: PRIMARY_RAMP });
    }

    override init(loader): void {
        this.luts = LOOKS.map(look => LutFilter.fromImage(buildLut3D(look.transform)));
        this.filter = new LutFilter({ mode: '3d', size: LUT_SIZE }).setLut(this.luts[0]);

        this.sprite = new Sprite(loader.get(Texture, 'ramp')).setAnchor(0.5).setScale(2.5);
        this.sprite.setPosition(400, 320);
        this.sprite.filters = [this.filter];

        this.label = new Text(LOOKS[0].name, { fillColor: Color.white, fontSize: 22 });
        this.label.setPosition(20, 20);
        this.hint = new Text('Press SPACE to cycle looks', { fillColor: Color.white, fontSize: 14 });
        this.hint.setPosition(20, 560);

        this.inputs.onTrigger(Keyboard.Space, () => {
            this.index = (this.index + 1) % LOOKS.length;
            this.filter.setLut(this.luts[this.index]);
            this.label.text = LOOKS[this.index].name;
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.label);
        context.render(this.hint);
    }
}

app.start(new ColorGradingScene());
