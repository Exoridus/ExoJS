import { Application, Color, Container, Graphics, Scene } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

const scales = [0.03, 0.06, 0.1];
const colors = [new Color(70, 90, 140), new Color(100, 140, 220), new Color(180, 220, 255)];

class MouseParallaxScene extends Scene {
    private layers!: Container[];
    private pointer = { x: 0, y: 0 };
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const { width, height } = this.app.canvas;
        this.pointer = { x: width / 2, y: height / 2 };

        // Spread the circle field across the full 16:9 canvas: 16 columns wide so
        // the layers fill the extra horizontal space instead of bunching on the left.
        const columns = 16;
        const stepX = width / columns;

        this.layers = scales.map((_, i) => {
            const layer = new Container();
            const shape = new Graphics();
            shape.fillColor = colors[i];
            for (let n = 0; n < columns; n++) {
                shape.drawCircle(stepX * 0.5 + n * stepX, height * 0.28 + (n % 3) * (height * 0.22), 28 + i * 8);
            }
            layer.addChild(shape);
            return layer;
        });

        this.hud = mountControls({
            title: 'Mouse Parallax',
            controls: [{ keys: 'Mouse', action: 'shift the layers' }],
            hint: 'Move the mouse — far layers drift slowly, near layers race ahead.',
        });

        this.app.input.onPointerMove.add(p => {
            this.pointer = { x: p.x, y: p.y };
        });
    }

    override draw(context): void {
        const { width, height } = this.app.canvas;

        context.backend.clear(new Color(18, 22, 34));
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            layer.setPosition((width / 2 - this.pointer.x) * scales[i], (height / 2 - this.pointer.y) * scales[i]);
            context.render(layer);
        }
    }
}

app.start(new MouseParallaxScene());
