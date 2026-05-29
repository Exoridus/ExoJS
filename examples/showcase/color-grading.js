import { Application, Color, Keyboard, LutFilter, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

const LUT_SIZE = 17;

// Build a few procedural 3D LUTs to switch between. In a real workflow you would
// load DaVinci/OBS-exported PNG strips via `LutFilter.fromImage(image)`.
function buildLut3D(transform) {
    const width = LUT_SIZE * LUT_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = LUT_SIZE;
    const ctx = canvas.getContext('2d');
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
    { name: 'Identity', transform: (r, g, b) => [r, g, b] },
    {
        name: 'Sepia',
        transform: (r, g, b) => {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            return [Math.min(1, lum * 1.2), Math.min(1, lum * 1.0), Math.min(1, lum * 0.6)];
        },
    },
    {
        name: 'Cool Cinematic',
        transform: (r, g, b) => [r * 0.85, g * 0.95, Math.min(1, b * 1.15 + 0.05)],
    },
    {
        name: 'Warm Sunset',
        transform: (r, g, b) => [Math.min(1, r * 1.15 + 0.05), g * 0.95, b * 0.75],
    },
    {
        name: 'Bleach Bypass',
        transform: (r, g, b) => {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            return [Math.min(1, r * 0.6 + lum * 0.6), Math.min(1, g * 0.6 + lum * 0.6), Math.min(1, b * 0.6 + lum * 0.6)];
        },
    },
    {
        name: 'Protanopia (red-blind)',
        transform: (r, g, b) => [0.567 * r + 0.433 * g, 0.558 * r + 0.442 * g, 0.242 * g + 0.758 * b],
    },
];

const PRIMARY_RAMP = globalThis.assets?.technical?.color?.primaryRamp ?? 'technical/color/primary-ramp.png';

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { ramp: PRIMARY_RAMP });
        }
        init(loader) {
            this._luts = LOOKS.map(look => LutFilter.fromImage(buildLut3D(look.transform)));
            this._filter = new LutFilter({ mode: '3d', size: LUT_SIZE }).setLut(this._luts[0]);
            this._index = 0;

            this._sprite = new Sprite(loader.get(Texture, 'ramp')).setAnchor(0.5).setScale(2.5);
            this._sprite.setPosition(400, 320);
            this._sprite.filters = [this._filter];

            this._label = new Text(LOOKS[0].name, { fill: 'white', fontSize: 22 });
            this._label.setPosition(20, 20);
            this._hint = new Text('Press SPACE to cycle looks', { fill: 'white', fontSize: 14 });
            this._hint.setPosition(20, 560);

            this.inputs.onTrigger(Keyboard.Space, () => {
                this._index = (this._index + 1) % LOOKS.length;
                this._filter.setLut(this._luts[this._index]);
                this._label.text = LOOKS[this._index].name;
            });
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
            context.render(this._label);
            context.render(this._hint);
        }
    })()
);
