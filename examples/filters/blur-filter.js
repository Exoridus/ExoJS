// Auto-generated from blur-filter.ts — edit the .ts source, not this file.
import { Application, BlurFilter, Color, Scene, Sprite } from '@codexo/exojs';
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
// High-detail, high-contrast content so the blur visibly softens hard edges.
const PIXEL_GRID = assets.technical.filtering.pixelGrid128;
const MAX_RADIUS = 14;
class BlurFilterScene extends Scene {
    blur;
    sprite;
    enabled = true;
    hud;
    panel;
    slider;
    async load(loader) {
        await loader.load(PIXEL_GRID);
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.blur = new BlurFilter({ radius: 4, quality: 2 });
        this.sprite = new Sprite(loader.get(PIXEL_GRID)).setAnchor(0.5).setScale(4.5).setPosition(width / 2, height / 2);
        this.sprite.filters = [this.blur];
        this.hud = mountControls({
            title: 'Blur Filter',
            controls: [
                { keys: 'Radius', action: 'soften the sprite (box-blur passes)' },
                { keys: 'Filter', action: 'toggle to compare before / after' },
            ],
            status: this.statusText(),
            hint: 'Drag the Radius slider — the live value is shown to its right.',
        });
        this.panel = mountControlPanel({ title: 'Blur' });
        this.slider = this.panel.addSlider({
            label: 'Radius',
            min: 0,
            max: MAX_RADIUS,
            step: 0.1,
            value: this.blur.radius,
            onChange: value => {
                this.blur.radius = value;
                this.refresh();
            },
        });
        this.panel.addToggle({
            label: 'Filter',
            value: true,
            onChange: on => {
                this.enabled = on;
                this.sprite.filters = on ? [this.blur] : [];
                this.refresh();
            },
        });
    }
    statusText() {
        if (!this.enabled) {
            return 'Filter: OFF (original sprite)';
        }
        return `Radius: ${this.blur.radius.toFixed(1)} px`;
    }
    refresh() {
        this.hud.setStatus(this.statusText());
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new BlurFilterScene());
