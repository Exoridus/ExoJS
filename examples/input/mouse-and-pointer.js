import { Application, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
            this._sprite.interactive = true;
            this._sprite.draggable = true;
            this._crosshair = new Graphics();
            this._pointer = { x: 400, y: 300 };

            this.app.input.onPointerMove.add(pointer => {
                this._pointer = { x: pointer.x, y: pointer.y };
            });
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
            this._crosshair.clear();
            this._crosshair.lineWidth = 2;
            this._crosshair.lineColor = new Color(255, 220, 80);
            this._crosshair.drawLine(this._pointer.x - 10, this._pointer.y, this._pointer.x + 10, this._pointer.y);
            this._crosshair.drawLine(this._pointer.x, this._pointer.y - 10, this._pointer.x, this._pointer.y + 10);
            this._crosshair.render(backend);
        }
    })()
);
