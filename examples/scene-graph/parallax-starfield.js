import { Application, Color, Graphics, Scene } from '@codexo/exojs';

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

const speeds = [0.15, 0.35, 0.6];
const counts = [60, 40, 24];
const colors = [new Color(120, 140, 200), new Color(170, 190, 255), new Color(255, 255, 255)];

app.start(
    new (class extends Scene {
        init() {
            this._layers = counts.map((count, index) => {
                const g = new Graphics();
                g.fillColor = colors[index];
                for (let i = 0; i < count; i++) {
                    const x = Math.random() * 900 - 50;
                    const y = Math.random() * 700 - 50;
                    const r = 1 + index;
                    g.drawCircle(x, y, r);
                }
                return g;
            });
            this._pointer = { x: 400, y: 300 };
            this.app.input.onPointerMove.add(pointer => {
                this._pointer = { x: pointer.x, y: pointer.y };
            });
        }
        draw(context) {
            context.backend.clear();
            for (let i = 0; i < this._layers.length; i++) {
                const layer = this._layers[i];
                const factor = speeds[i];
                layer.setPosition((400 - this._pointer.x) * factor, (300 - this._pointer.y) * factor);
                context.render(layer);
            }
        }
    })()
);
