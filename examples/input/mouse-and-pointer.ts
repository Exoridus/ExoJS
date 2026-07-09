import { Application, Color, Graphics, Scene, Sprite } from '@codexo/exojs';
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

// Everything the pointer pipeline reports, surfaced at once:
//   - live position (onPointerMove)
//   - pressed-button bitmask (Pointer.buttons: 1=left, 2=right, 4=middle)
//   - frame-to-frame movement delta
//   - a click counter (onPointerTap fires on a press+release without a drag)
//   - a draggable sprite (the engine's built-in drag on an interactive node)
class MouseAndPointerScene extends Scene {
    private ship!: Sprite;
    private crosshair!: Graphics;
    private pointer = { x: 400, y: 300 };
    private previous = { x: 400, y: 300 };
    private deltaX = 0;
    private deltaY = 0;
    private buttons = 0;
    private clicks = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load('image/ship-a.png');
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.pointer = { x: width / 2, y: height / 2 };
        this.previous = { x: width / 2, y: height / 2 };

        this.ship = new Sprite(loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
        this.ship.interactive = true;
        this.ship.draggable = true;
        this.crosshair = new Graphics();

        this.app.input.onPointerMove.add(pointer => {
            this.pointer.x = pointer.x;
            this.pointer.y = pointer.y;
            this.buttons = pointer.buttons;
        });
        this.app.input.onPointerDown.add(pointer => {
            this.buttons = pointer.buttons;
        });
        this.app.input.onPointerUp.add(pointer => {
            this.buttons = pointer.buttons;
        });
        this.app.input.onPointerTap.add(() => {
            this.clicks++;
        });

        this.hud = mountControls({
            title: 'Mouse and Pointer',
            controls: [
                { keys: 'Move', action: 'track position + delta' },
                { keys: 'Click', action: 'count taps' },
                { keys: 'Drag', action: 'move the ship sprite' },
            ],
            status: '',
            hint: 'Drag the ship to move it; the crosshair follows the cursor.',
        });
    }

    private buttonLabel(): string {
        const held = [this.buttons & 1 && 'Left', this.buttons & 2 && 'Right', this.buttons & 4 && 'Middle'].filter(Boolean);

        return held.length ? held.join(' + ') : 'none';
    }

    override update(): void {
        this.deltaX = this.pointer.x - this.previous.x;
        this.deltaY = this.pointer.y - this.previous.y;
        this.previous.x = this.pointer.x;
        this.previous.y = this.pointer.y;

        this.hud.setStatus(
            `x ${Math.round(this.pointer.x)}, y ${Math.round(this.pointer.y)} · Δ ${this.deltaX >= 0 ? '+' : ''}${this.deltaX.toFixed(0)}, ${this.deltaY >= 0 ? '+' : ''}${this.deltaY.toFixed(0)} · buttons: ${this.buttonLabel()} · clicks: ${this.clicks}`,
        );
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.ship);

        this.crosshair.clear();
        this.crosshair.lineWidth = 2;
        this.crosshair.lineColor = new Color(255, 220, 80);
        this.crosshair.drawLine(this.pointer.x - 12, this.pointer.y, this.pointer.x + 12, this.pointer.y);
        this.crosshair.drawLine(this.pointer.x, this.pointer.y - 12, this.pointer.x, this.pointer.y + 12);
        context.render(this.crosshair);
    }
}

app.start(new MouseAndPointerScene());
