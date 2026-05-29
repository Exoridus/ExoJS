import { Application, Color, LutFilter, Scene, Sprite, Texture } from '@codexo/exojs';

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

const PALETTE_SIZE = 256;

function buildPaletteCanvas(offset) {
    const canvas = document.createElement('canvas');
    canvas.width = PALETTE_SIZE;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(PALETTE_SIZE, 1);
    for (let i = 0; i < PALETTE_SIZE; i++) {
        const phase = ((i + offset) / PALETTE_SIZE) * Math.PI * 2;
        const r = Math.round(127 + 127 * Math.sin(phase));
        const g = Math.round(127 + 127 * Math.sin(phase + (Math.PI * 2) / 3));
        const b = Math.round(127 + 127 * Math.sin(phase + (Math.PI * 4) / 3));
        const o = i * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._palette = LutFilter.fromImage(buildPaletteCanvas(0));
            this._filter = new LutFilter({ mode: '1d' }).setLut(this._palette);

            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(4);
            this._sprite.setPosition(400, 300);
            this._sprite.filters = [this._filter];

            this._offset = 0;
        }
        update(delta) {
            this._offset = (this._offset + delta.seconds * 80) % PALETTE_SIZE;
            this._palette.source = buildPaletteCanvas(Math.floor(this._offset));
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
        }
    })()
);
