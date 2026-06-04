import { technical, textures } from '@assets';
import { Application, BlendModes, Color, ScaleModes, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const ALPHA_RINGS = technical.alpha.alphaGradientRings;

class BlendmodesScene extends Scene {
    private _background!: Sprite;
    private _leftBunny!: Sprite;
    private _rightBunny!: Sprite;
    private _blendModes!: BlendModes[];
    private _blendModeNames!: string[];
    private _blendModeIndex = 0;
    private _ticker = 0;
    private _info!: Text;

    override async load(loader): Promise<void> {
        await loader.load(
            Texture,
            {
                background: ALPHA_RINGS,
                bunny: textures.shipA,
            },
            {
                scaleMode: ScaleModes.Nearest,
            },
        );
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this._background = new Sprite(loader.get(Texture, 'background'));
        this._background.setPosition(width / 2, height / 2);
        this._background.setAnchor(0.5, 0.5);
        this._background.setScale(Math.max(width, height) / 256);

        this._leftBunny = new Sprite(loader.get(Texture, 'bunny'));
        this._leftBunny.setAnchor(0.5, 0.5);
        this._leftBunny.setScale(5);

        this._rightBunny = new Sprite(loader.get(Texture, 'bunny'));
        this._rightBunny.setAnchor(0.5, 0.5);
        this._rightBunny.setScale(5);

        this._blendModes = [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply, BlendModes.Screen];
        this._blendModeNames = ['NORMAL', 'ADDITIVE', 'SUBTRACT', 'MULTIPLY', 'SCREEN'];

        this._info = new Text('Click to switch between blend modes', {
            fontSize: 16,
            fillColor: Color.white,
            align: 'center',
        });

        this._info.setPosition(width / 2, 0);
        this._info.setAnchor(0.5, 0);

        this.app.input.onPointerDown.add(() => this.updateBlendMode());

        this.updateBlendMode();
    }

    private updateBlendMode(): void {
        this._blendModeIndex = (this._blendModeIndex + 1) % this._blendModes.length;

        this._leftBunny.setBlendMode(this._blendModes[this._blendModeIndex]);
        this._rightBunny.setBlendMode(this._blendModes[this._blendModeIndex]);

        this._info.text = [`Click to switch between blend modes`, `Current blend mode: ${this._blendModeNames[this._blendModeIndex]}`].join('\n');
    }

    override update(delta): void {
        const canvas = this.app.canvas;
        const offset = (Math.cos(this._ticker * 3) * 0.5 + 0.5) * (canvas.width * 0.25);

        this._leftBunny.setPosition(canvas.width / 2 - offset, canvas.height / 2);
        this._rightBunny.setPosition(canvas.width / 2 + offset, canvas.height / 2);

        this._ticker += delta.seconds;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._background);
        context.render(this._leftBunny);
        context.render(this._rightBunny);
        context.render(this._info);
    }
}

app.start(new BlendmodesScene());
