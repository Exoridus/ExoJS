// Auto-generated from color-matrix-filter.ts - edit the .ts source, not this file.
import { Application, Color, ColorMatrixFilter, FixedResolutionCanvasSizing, Scene, Sprite } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
// A full-hue ramp shows every preset on every colour at once.
const HUE_RAMP = assets.technical.color.hueRamp;
// One filter class, one matrix - each preset is a different concatenation onto
// it, not a different filter. `reset()` goes back to the identity first so the
// presets do not stack on each other.
const PRESETS = [
    { label: 'Tint', apply: (filter) => filter.tint(new Color(255, 160, 120)) },
    { label: 'Desaturate', apply: (filter) => filter.grayscale() },
    { label: 'Invert', apply: (filter) => filter.invert() },
    { label: 'Brightness', apply: (filter) => filter.brightness(1.6) },
    { label: 'Contrast', apply: (filter) => filter.contrast(1.8) },
    { label: 'Sepia', apply: (filter) => filter.sepia() },
];
class ColorMatrixFilterScene extends Scene {
    sprite;
    filter;
    index = 1; // start on Desaturate - the most visually obvious preset
    hud;
    cycle;
    init() {
        const app = this.app;
        const { width, height } = app;
        this.sprite = new Sprite(this.loader.get(HUE_RAMP)).setAnchor(0.5).setScale(4).setPosition(width / 2, height / 2);
        this.filter = new ColorMatrixFilter();
        this.sprite.filters = [this.filter];
        this.applyPreset();
        this.hud = mountControls({
            title: 'Color Matrix Filter',
            controls: [{ keys: 'Preset', action: 'tint · desaturate · invert · brightness · contrast · sepia' }],
            status: this.statusText(),
            hint: 'Every preset is one affine colour matrix; switching rewrites the matrix in place.',
        });
        this.cycle = mountControlPanel({ title: 'Colour Grade' }).addCycle({
            label: 'Preset',
            options: PRESETS.map(preset => preset.label),
            index: this.index,
            onChange: index => {
                this.index = index;
                this.applyPreset();
            },
        });
    }
    applyPreset() {
        PRESETS[this.index].apply(this.filter.reset());
        this.cycle?.set(this.index);
        this.hud?.setStatus(this.statusText());
    }
    statusText() {
        return `Preset: ${PRESETS[this.index].label}  (${this.index + 1}/${PRESETS.length})`;
    }
    draw(context) {
        context.render(this.sprite);
    }
}
const app = new Application({
    scenes: { ColorMatrixFilterScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizing: new FixedResolutionCanvasSizing(),
    },
    clearColor: Color.black,
});
app.start(ColorMatrixFilterScene);
