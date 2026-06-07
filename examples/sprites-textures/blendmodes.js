// Auto-generated from blendmodes.ts — edit the .ts source, not this file.
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
    background;
    leftBunny;
    rightBunny;
    blendModes;
    blendModeNames;
    blendModeIndex = 0;
    ticker = 0;
    info;
    async load(loader) {
        await loader.load(Texture, {
            background: ALPHA_RINGS,
            bunny: textures.shipA,
        }, {
            scaleMode: ScaleModes.Nearest,
        });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.background = new Sprite(loader.get(Texture, 'background'));
        this.background.setPosition(width / 2, height / 2);
        this.background.setAnchor(0.5, 0.5);
        this.background.setScale(Math.max(width, height) / 256);
        this.leftBunny = new Sprite(loader.get(Texture, 'bunny'));
        this.leftBunny.setAnchor(0.5, 0.5);
        this.leftBunny.setScale(5);
        this.rightBunny = new Sprite(loader.get(Texture, 'bunny'));
        this.rightBunny.setAnchor(0.5, 0.5);
        this.rightBunny.setScale(5);
        this.blendModes = [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply, BlendModes.Screen];
        this.blendModeNames = ['NORMAL', 'ADDITIVE', 'SUBTRACT', 'MULTIPLY', 'SCREEN'];
        this.info = new Text('Click to switch between blend modes', {
            fontSize: 16,
            fillColor: Color.white,
            align: 'center',
        });
        this.info.setPosition(width / 2, 0);
        this.info.setAnchor(0.5, 0);
        this.app.input.onPointerDown.add(() => this.updateBlendMode());
        this.updateBlendMode();
    }
    updateBlendMode() {
        this.blendModeIndex = (this.blendModeIndex + 1) % this.blendModes.length;
        this.leftBunny.setBlendMode(this.blendModes[this.blendModeIndex]);
        this.rightBunny.setBlendMode(this.blendModes[this.blendModeIndex]);
        this.info.text = [`Click to switch between blend modes`, `Current blend mode: ${this.blendModeNames[this.blendModeIndex]}`].join('\n');
    }
    update(delta) {
        const canvas = this.app.canvas;
        const offset = (Math.cos(this.ticker * 3) * 0.5 + 0.5) * (canvas.width * 0.25);
        this.leftBunny.setPosition(canvas.width / 2 - offset, canvas.height / 2);
        this.rightBunny.setPosition(canvas.width / 2 + offset, canvas.height / 2);
        this.ticker += delta.seconds;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.background);
        context.render(this.leftBunny);
        context.render(this.rightBunny);
        context.render(this.info);
    }
}
app.start(new BlendmodesScene());
