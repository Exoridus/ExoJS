import { Application, Color, Graphics, Scene, View } from '@codexo/exojs';

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

app.start(
    new (class extends Scene {
        init() {
            this._view = new View(260, 180, 800, 600);
            this._grid = new Graphics();
            this._markers = new Graphics();

            this._grid.lineWidth = 1;
            this._grid.lineColor = new Color(70, 70, 70);
            for (let x = -400; x <= 1200; x += 80) this._grid.drawLine(x, -300, x, 1000);
            for (let y = -300; y <= 1000; y += 80) this._grid.drawLine(-400, y, 1200, y);

            this.app.input.onPointerTap.add(pointer => {
                const world = this._toWorld(pointer.x, pointer.y);
                this._markers.fillColor = new Color(255, 160, 80);
                this._markers.drawCircle(world.x, world.y, 6);
            });
        }
        _toWorld(screenX, screenY) {
            const width = this.app.canvas.width;
            const height = this.app.canvas.height;
            const clipX = (screenX / width) * 2 - 1;
            const clipY = 1 - (screenY / height) * 2;
            const matrix = this._view.getInverseTransform();

            return {
                x: matrix.a * clipX + matrix.b * clipY + matrix.x,
                y: matrix.c * clipX + matrix.d * clipY + matrix.y,
            };
        }
        draw(context) {
            context.backend.clear();
            context.backend.setView(this._view);
            context.render(this._grid);
            context.render(this._markers);
            context.backend.setView(null);
        }
    })()
);
