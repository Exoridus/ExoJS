// Auto-generated from palette-cycling.ts — edit the .ts source, not this file.
import { Application, Color, LutFilter, Scene, Sprite, Texture } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
const PRIMARY_RAMP = assets.technical.color.primaryRamp;
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
class PaletteCyclingScene extends Scene {
    palette;
    filter;
    sprite;
    offset = 0;
    async load(loader) {
        await loader.load(Texture, { ramp: PRIMARY_RAMP });
    }
    init(loader) {
        this.palette = LutFilter.fromImage(buildPaletteCanvas(0));
        this.filter = new LutFilter({ mode: '1d' }).setLut(this.palette);
        this.sprite = new Sprite(loader.get(Texture, 'ramp')).setAnchor(0.5).setScale(3);
        this.sprite.setPosition(400, 300);
        this.sprite.filters = [this.filter];
    }
    update(delta) {
        this.offset = (this.offset + delta.seconds * 80) % PALETTE_SIZE;
        this.palette.source = buildPaletteCanvas(Math.floor(this.offset));
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new PaletteCyclingScene());
