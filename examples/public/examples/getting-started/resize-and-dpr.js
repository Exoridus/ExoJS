import { Application, Color, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.style.margin = '0';
document.body.append(app.canvas);

const resize = () => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;

    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;
    app.resize(Math.round(width * dpr), Math.round(height * dpr));
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
            this._info.setText(`${width}x${height} @ DPR ${dpr.toFixed(2)}`);
        }
        update() {
            this._layout();
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
            this._info.render(backend);
        }
    })()
);
