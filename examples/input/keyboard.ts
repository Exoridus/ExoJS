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
    private _sprite!: Sprite;
    private _move = { w: 0, a: 0, s: 0, d: 0 };

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);

        this.inputs.onActive(Keyboard.W, () => {
            this._move.w = 1;
        });
        this.inputs.onStop(Keyboard.W, () => {
            this._move.w = 0;
        });
        this.inputs.onActive(Keyboard.A, () => {
            this._move.a = 1;
        });
        this.inputs.onStop(Keyboard.A, () => {
            this._move.a = 0;
        });
        this.inputs.onActive(Keyboard.S, () => {
            this._move.s = 1;
        });
        this.inputs.onStop(Keyboard.S, () => {
            this._move.s = 0;
        });
        this.inputs.onActive(Keyboard.D, () => {
            this._move.d = 1;
        });
        this.inputs.onStop(Keyboard.D, () => {
            this._move.d = 0;
        });
        this.inputs.onTrigger(Keyboard.Escape, () => {
            this._sprite.setPosition(400, 300);
        });
    }

    override update(delta): void {
        const speed = 280 * delta.seconds;
        this._sprite.move((this._move.d - this._move.a) * speed, (this._move.s - this._move.w) * speed);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
    }
}

app.start(new KeyboardScene());
