import { Application, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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

class PauseResumeScene extends Scene {
    private _paused = false;
    private _sprite!: Sprite;
    private _label!: Text;

    override async load(loader): Promise<void> {
        this._sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        this._sprite.setAnchor(0.5);
        this._sprite.setPosition(width / 2, height / 2);

        this._label = new Text('Space: pause update', { fillColor: Color.white, fontSize: 16 });
        this._label.setAnchor(0.5, 0);
        this._label.setPosition(width / 2, 16);

        this.inputs.onTrigger(Keyboard.Space, () => {
            this._paused = !this._paused;
            this._label.text = this._paused ? 'Paused (draw running)' : 'Running';
        });
    }

    override update(delta): void {
        if (this._paused) {
            return;
        }

        this._sprite.rotate(delta.seconds * 180);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
        context.render(this._label);
    }
}

app.start(new PauseResumeScene());
