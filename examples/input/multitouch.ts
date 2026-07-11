import { Application, Color, Graphics, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(10, 12, 20),
    loader: {
        basePath: 'assets/',
    },
});

const MAX_TOUCHES = 10;

// Ten distinct hues so up to ten simultaneous fingers each get their own colour.
const colors = [
    new Color(255, 100, 100),
    new Color(255, 170, 90),
    new Color(255, 230, 120),
    new Color(170, 255, 120),
    new Color(100, 255, 160),
    new Color(100, 230, 255),
    new Color(120, 170, 255),
    new Color(170, 130, 255),
    new Color(230, 120, 255),
    new Color(255, 130, 200),
];

interface Touch {
    id: number;
    x: number;
    y: number;
}

class MultitouchScene extends Scene {
    private graphics!: Graphics;
    private labels: Array<Text> = [];
    private pointers = new Map<number, Touch>();
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        this.graphics = new Graphics();

        // Reusable label pool — one Text per possible touch, repositioned each frame.
        for (let i = 0; i < MAX_TOUCHES; i++) {
            this.labels.push(new Text('', { fillColor: Color.white, fontSize: 16 }).setAnchor(0.5));
        }

        app.input.onPointerDown.add(pointer => {
            if (this.pointers.size >= MAX_TOUCHES || this.pointers.has(pointer.id)) {
                return;
            }

            this.pointers.set(pointer.id, { id: pointer.id, x: pointer.x, y: pointer.y });
            this.refreshHud();
        });
        app.input.onPointerMove.add(pointer => {
            const touch = this.pointers.get(pointer.id);

            if (touch) {
                touch.x = pointer.x;
                touch.y = pointer.y;
            }
        });
        app.input.onPointerUp.add(pointer => {
            this.pointers.delete(pointer.id);
            this.refreshHud();
        });
        app.input.onPointerCancel.add(pointer => {
            this.pointers.delete(pointer.id);
            this.refreshHud();
        });

        this.hud = mountControls({
            title: 'Multitouch',
            controls: [{ keys: 'Touch', action: 'each finger draws a circle' }],
            status: 'Active touches: 0 / 10',
            hint: 'Touchscreen required — use multiple fingers (mouse gives one point).',
        });
    }

    private refreshHud(): void {
        this.hud.setStatus(`Active touches: ${this.pointers.size} / ${MAX_TOUCHES}`);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        this.graphics.clear();

        let index = 0;

        for (const touch of this.pointers.values()) {
            const color = colors[index % colors.length];

            this.graphics.fillColor = color;
            this.graphics.drawCircle(touch.x, touch.y, 28);

            const label = this.labels[index];

            label.text = `${index + 1}·#${touch.id}`;
            label.setPosition(touch.x, touch.y);

            index++;
        }

        context.render(this.graphics);

        // Draw the index/id labels on top of their circles.
        for (let i = 0; i < this.pointers.size; i++) {
            context.render(this.labels[i]);
        }
    }
}

app.start(new MultitouchScene());
