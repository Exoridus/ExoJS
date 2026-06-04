import { Application, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';

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

class MouseAndPointerScene extends Scene {
    private _sprite!: Sprite;
    private _crosshair!: Graphics;
    private _pointer = { x: 400, y: 300 };

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this._sprite.interactive = true;
        this._sprite.draggable = true;
        this._crosshair = new Graphics();

        this.app.input.onPointerMove.add(pointer => {
            this._pointer = { x: pointer.x, y: pointer.y };
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
        this._crosshair.clear();
        this._crosshair.lineWidth = 2;
        this._crosshair.lineColor = new Color(255, 220, 80);
        this._crosshair.drawLine(this._pointer.x - 10, this._pointer.y, this._pointer.x + 10, this._pointer.y);
        this._crosshair.drawLine(this._pointer.x, this._pointer.y - 10, this._pointer.x, this._pointer.y + 10);
        context.render(this._crosshair);
    }
}

app.start(new MouseAndPointerScene());
