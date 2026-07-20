import { Application, Color, LutFilter, type RenderingContext, Scene, Sprite, Texture, type Time } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';



const PRIMARY_RAMP = assets.technical.color.primaryRamp;

const PALETTE_SIZE = 256;

function buildPaletteCanvas(offset: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = PALETTE_SIZE;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
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
    private palette!: Texture;
    private filter!: LutFilter;
    private sprite!: Sprite;
    private offset = 0;
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.palette = LutFilter.fromImage(buildPaletteCanvas(0));
        this.filter = new LutFilter({ mode: '1d' }).setLut(this.palette);

        this.sprite = new Sprite(this.loader.get(PRIMARY_RAMP)).setAnchor(0.5).setScale(4);
        this.sprite.setPosition(width / 2, height / 2);
        this.sprite.filters = [this.filter];

        this.hud = mountControls({
            title: 'Palette Cycling',
            status: 'Rotating a 1D LUT each frame remaps the sprite colours.',
            hint: 'Classic indexed-colour palette cycling: the texture is unchanged, only the lookup shifts.',
        });
    }

    override update(delta: Time): void {
        this.offset = (this.offset + delta.seconds * 80) % PALETTE_SIZE;
        this.palette.source = buildPaletteCanvas(Math.floor(this.offset));
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

const app = new Application({
    scenes: { PaletteCyclingScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

app.start(PaletteCyclingScene);
