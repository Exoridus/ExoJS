import { Application, Color, Graphics, Scene, Text, View } from '@codexo/exojs';

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

class WorldScreenScene extends Scene {
    private _view!: View;
    private _grid!: Graphics;
    private _markers!: Graphics;
    private _text!: Text;
    private _pointer = { x: 0, y: 0 };

    override init(): void {
        const { width, height } = this.app.canvas;

        this._view = new View(260, 160, width, height);
        this._grid = new Graphics();
        this._markers = new Graphics();
        this._text = new Text('', { fillColor: Color.white, fontSize: 16 });

        this._grid.lineWidth = 1;
        this._grid.lineColor = new Color(60, 60, 60);

        for (let x = -200; x <= 1200; x += 100) {
            this._grid.drawLine(x, -200, x, 1000);
        }

        for (let y = -200; y <= 1000; y += 100) {
            this._grid.drawLine(-200, y, 1200, y);
        }

        this.app.input.onPointerMove.add(pointer => {
            this._pointer = { x: pointer.x, y: pointer.y };
        });

        this.app.input.onPointerTap.add(pointer => {
            const world = this._toWorld(pointer.x, pointer.y);
            this._markers.fillColor = new Color(255, 220, 80);
            this._markers.drawCircle(world.x, world.y, 8);
        });
    }

    override draw(context): void {
        const world = this._toWorld(this._pointer.x, this._pointer.y);

        this._text.text = `screen: ${this._pointer.x | 0}, ${this._pointer.y | 0}\nworld: ${world.x | 0}, ${world.y | 0}`;
        this._text.setPosition(12, 12);

        context.backend.clear();
        context.backend.setView(this._view);
        context.render(this._grid);
        context.render(this._markers);
        context.backend.setView(null);
        context.render(this._text);
    }

    private _toWorld(screenX, screenY): { x: number; y: number } {
        const width = this.app.canvas.width;
        const height = this.app.canvas.height;
        const clipX = (screenX / width) * 2 - 1;
        const clipY = 1 - (screenY / height) * 2;
        const inverse = this._view.getInverseTransform();

        return {
            x: inverse.a * clipX + inverse.b * clipY + inverse.x,
            y: inverse.c * clipX + inverse.d * clipY + inverse.y,
        };
    }
}

app.start(new WorldScreenScene());
