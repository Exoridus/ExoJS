import { Application, Color, Ease, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

const waypoints = [
    { x: 120, y: 320 },
    { x: 220, y: 180 },
    { x: 360, y: 140 },
    { x: 520, y: 200 },
    { x: 680, y: 320 },
    { x: 580, y: 430 },
    { x: 400, y: 470 },
    { x: 220, y: 410 },
];

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(waypoints[0].x, waypoints[0].y);
            this._buildPath();
        }
        _buildPath() {
            let first = null;
            let prev = null;
            for (let i = 1; i < waypoints.length; i++) {
                const next = this.app.tweens.create(this._sprite.position).to(waypoints[i], 0.35).easing(Ease.sineInOut);
                if (first === null) first = next;
                if (prev !== null) prev.chain(next);
                prev = next;
            }
            prev.onComplete(() => {
                this._sprite.setPosition(waypoints[0].x, waypoints[0].y);
                this._buildPath();
            });
            first.start();
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
        }
    })()
);
