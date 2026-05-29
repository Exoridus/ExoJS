import { Application, Color, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
        pixelRatio: window.devicePixelRatio || 1,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.style.margin = '0';
document.body.append(app.canvas);

const resize = () => {
    app.resize(window.innerWidth, window.innerHeight);
};

window.addEventListener('resize', resize);
resize();

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny'));
            this._sprite.setAnchor(0.5);
            this._info = new Text('', { fill: 'white', fontSize: 16, padding: 6 });
            this._info.setAnchor(0.5, 0);
            this._layout();
        }
        _layout() {
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const width = this.app.canvas.width;
            const height = this.app.canvas.height;

            this._sprite.setPosition(width / 2, height / 2);
            this._info.setPosition(width / 2, 12);
            this._info.text = `${width}x${height} @ DPR ${dpr.toFixed(2)}`;
        }
        update() {
            this._layout();
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
            context.render(this._info);
        }
    })()
);
