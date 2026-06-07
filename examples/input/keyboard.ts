import { Application, Color, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';

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

class KeyboardScene extends Scene {
    private sprite!: Sprite;
    private move = { w: 0, a: 0, s: 0, d: 0 };

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);

        this.inputs.onActive(Keyboard.W, () => {
            this.move.w = 1;
        });
        this.inputs.onStop(Keyboard.W, () => {
            this.move.w = 0;
        });
        this.inputs.onActive(Keyboard.A, () => {
            this.move.a = 1;
        });
        this.inputs.onStop(Keyboard.A, () => {
            this.move.a = 0;
        });
        this.inputs.onActive(Keyboard.S, () => {
            this.move.s = 1;
        });
        this.inputs.onStop(Keyboard.S, () => {
            this.move.s = 0;
        });
        this.inputs.onActive(Keyboard.D, () => {
            this.move.d = 1;
        });
        this.inputs.onStop(Keyboard.D, () => {
            this.move.d = 0;
        });
        this.inputs.onTrigger(Keyboard.Escape, () => {
            this.sprite.setPosition(400, 300);
        });
    }

    override update(delta): void {
        const speed = 280 * delta.seconds;
        this.sprite.move((this.move.d - this.move.a) * speed, (this.move.s - this.move.w) * speed);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new KeyboardScene());
