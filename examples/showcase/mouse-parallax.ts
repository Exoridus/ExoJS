import { Application, Color, Container, Graphics, Scene } from '@codexo/exojs';

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

const scales = [0.03, 0.06, 0.1];
const colors = [new Color(70, 90, 140), new Color(100, 140, 220), new Color(180, 220, 255)];

class MouseParallaxScene extends Scene {
    private layers!: Container[];
    private pointer = { x: 400, y: 300 };

    override init(): void {
        this.layers = scales.map((_, i) => {
            const layer = new Container();
            const shape = new Graphics();
            shape.fillColor = colors[i];
            for (let n = 0; n < 10; n++) shape.drawCircle(80 + n * 80, 170 + (n % 3) * 120, 28 + i * 8);
            layer.addChild(shape);
            return layer;
        });
        this.app.input.onPointerMove.add(p => {
            this.pointer = { x: p.x, y: p.y };
        });
    }

    override draw(context): void {
        context.backend.clear(new Color(18, 22, 34));
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            layer.setPosition((400 - this.pointer.x) * scales[i], (300 - this.pointer.y) * scales[i]);
            context.render(layer);
        }
    }
}

app.start(new MouseParallaxScene());
