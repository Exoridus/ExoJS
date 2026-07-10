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
    private blur!: BlurFilter;
    private sprite!: Sprite;
    private enabled = true;
    private hud!: ReturnType<typeof mountControls>;
    private panel!: ReturnType<typeof mountControlPanel>;
    private slider!: ReturnType<ReturnType<typeof mountControlPanel>['addSlider']>;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.blur = new BlurFilter({ radius: 4, quality: 2 });
        this.sprite = new Sprite(this.loader.get(PIXEL_GRID)).setAnchor(0.5).setScale(4.5).setPosition(width / 2, height / 2);
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

    private statusText(): string {
        if (!this.enabled) {
            return 'Filter: OFF (original sprite)';
        }

        return `Radius: ${this.blur.radius.toFixed(1)} px`;
    }

    private refresh(): void {
        this.hud.setStatus(this.statusText());
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new BlurFilterScene());
