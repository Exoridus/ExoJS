import { Application, Color, Scene, ScaleModes, Sprite, BlendModes, Text, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Texture, {
            background: 'image/uv.png',
            bunny: 'image/bunny.png',
        }, {
            scaleMode: ScaleModes.Nearest,
        });
    }
    init(loader) {
        const { width, height } = this.app.canvas;

        this._background = new Sprite(loader.get(Texture, 'background'));
        this._background.setPosition(width / 2, height / 2);
        this._background.setAnchor(0.5, 0.5);

        this._leftBunny = new Sprite(loader.get(Texture, 'bunny'));
        this._leftBunny.setAnchor(0.5, 0.5);
        this._leftBunny.setScale(5);

        this._rightBunny = new Sprite(loader.get(Texture, 'bunny'));
        this._rightBunny.setAnchor(0.5, 0.5);
        this._rightBunny.setScale(5);

        this._blendModes = [
            BlendModes.Normal,
            BlendModes.Additive,
            BlendModes.Subtract,
            BlendModes.Multiply,
            BlendModes.Screen,
        ];

        this._blendModeNames = [
            'NORMAL',
            'ADDITIVE',
            'SUBTRACT',
            'MULTIPLY',
            'SCREEN',
        ];

        this._blendModeIndex = 0;
        this._ticker = 0;

        this._info = new Text('Click to switch between blend modes', {
            fontSize: 16,
            padding: 10,
            fill: '#fff',
            align: 'center',
        });

        this._info.setPosition(width / 2, 0);
        this._info.setAnchor(0.5, 0);

        this.app.inputManager.onPointerDown.add(this.updateBlendMode, this);

        this.updateBlendMode();
    }
    updateBlendMode() {
        this._blendModeIndex = (this._blendModeIndex + 1) % this._blendModes.length;

        this._leftBunny.setBlendMode(this._blendModes[this._blendModeIndex]);
        this._rightBunny.setBlendMode(this._blendModes[this._blendModeIndex]);

        this._info.setText([
            `Click to switch between blend modes`,
            `Current blend mode: ${this._blendModeNames[this._blendModeIndex]}`,
        ].join('\n'));
    }
    update(delta) {
        const canvas = this.app.canvas,
            offset = (Math.cos(this._ticker * 3) * 0.5 + 0.5) * (canvas.width * 0.25);

        this._leftBunny.setPosition((canvas.width / 2) - offset, canvas.height / 2);
        this._rightBunny.setPosition((canvas.width / 2) + offset, canvas.height / 2);

        this._ticker += delta.seconds;
    }
    draw(backend) {
        backend.clear();
        this._background.render(backend);
        this._leftBunny.render(backend);
        this._rightBunny.render(backend);
        this._info.render(backend);
    }
});
