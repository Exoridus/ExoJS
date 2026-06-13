import { Application, BlendModes, Color, ScaleModes, Scene, Sprite, Texture } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    // A mid-tone backdrop so darkening modes (Subtract, Multiply, Darken) stay
    // visible instead of compositing into a black canvas.
    clearColor: new Color(48, 54, 68),
});

const ALPHA_RINGS = assets.technical.alpha.alphaGradientRings;

// Every public blend mode, in enum order, paired with a display name.
const BLEND_MODES: Array<{ mode: BlendModes; name: string }> = [
    { mode: BlendModes.Normal, name: 'Normal' },
    { mode: BlendModes.Additive, name: 'Additive' },
    { mode: BlendModes.Subtract, name: 'Subtract' },
    { mode: BlendModes.Multiply, name: 'Multiply' },
    { mode: BlendModes.Screen, name: 'Screen' },
    { mode: BlendModes.Darken, name: 'Darken' },
    { mode: BlendModes.Lighten, name: 'Lighten' },
];

class BlendmodesScene extends Scene {
    private background!: Sprite;
    private left!: Sprite;
    private right!: Sprite;
    private index = 0;
    private ticker = 0;
    private hud!: ReturnType<typeof mountControls>;
    private cycle!: { set(value: number): void };

    override async load(loader): Promise<void> {
        await loader.load(
            Texture,
            {
                background: ALPHA_RINGS,
                ship: assets.demo.textures.shipA,
            },
            {
                scaleMode: ScaleModes.Nearest,
            },
        );
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.background = new Sprite(loader.get(Texture, 'background'));
        this.background.setPosition(width / 2, height / 2);
        this.background.setAnchor(0.5, 0.5);
        this.background.setScale(Math.max(width, height) / 256);
        this.background.setTint(new Color(120, 130, 150));

        // Two overlapping sprites in complementary hues so the composite in the
        // overlap region differs clearly between modes.
        this.left = new Sprite(loader.get(Texture, 'ship'));
        this.left.setAnchor(0.5, 0.5);
        this.left.setScale(5);
        this.left.setTint(new Color(80, 210, 255));

        this.right = new Sprite(loader.get(Texture, 'ship'));
        this.right.setAnchor(0.5, 0.5);
        this.right.setScale(5);
        this.right.setTint(new Color(255, 96, 200));

        this.hud = mountControls({
            title: 'Blend Modes',
            controls: [{ keys: 'Click', action: 'next blend mode' }],
        });
        this.cycle = mountControlPanel({ title: 'Compositing' }).addCycle({
            label: 'Blend mode',
            options: BLEND_MODES.map(entry => entry.name),
            index: 0,
            onChange: index => this.setIndex(index),
        });

        this.app.input.onPointerDown.add(() => this.setIndex((this.index + 1) % BLEND_MODES.length));

        // Apply the initial mode (Normal) without skipping it.
        this.applyBlendMode();
    }

    private setIndex(index: number): void {
        this.index = ((index % BLEND_MODES.length) + BLEND_MODES.length) % BLEND_MODES.length;
        this.applyBlendMode();
    }

    private applyBlendMode(): void {
        const { mode, name } = BLEND_MODES[this.index];

        this.left.setBlendMode(mode);
        this.right.setBlendMode(mode);
        this.cycle.set(this.index);
        this.hud.setStatus(`${name}  (${this.index + 1}/${BLEND_MODES.length})`);
    }

    override update(delta): void {
        const { width, height } = this.app.canvas;
        const offset = (Math.cos(this.ticker * 1.4) * 0.5 + 0.5) * (width * 0.22);

        this.left.setPosition(width / 2 - offset, height / 2);
        this.right.setPosition(width / 2 + offset, height / 2);

        this.ticker += delta.seconds;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.background);
        context.render(this.left);
        context.render(this.right);
    }
}

app.start(new BlendmodesScene());
