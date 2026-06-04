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

class KeyRebindingScene extends Scene {
    private _sprite!: Sprite;
    private _text!: Text;
    private _jumpChannel = Keyboard.Space;
    private _rebindRequested = false;
    private _jumpDirty = true;
    private _jumpVelocity = 0;
    private _jumpBinding: { unbind(): void } | undefined;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this._text = new Text('', { fillColor: Color.white, fontSize: 18, lineHeight: 24 });
        this._text.setPosition(20, 20);

        this.inputs.onTrigger(Keyboard.J, () => {
            this._rebindRequested = true;
        });
        this.app.input.onKeyDown.add(channel => {
            if (!this._rebindRequested) return;
            this._jumpChannel = channel;
            this._rebindRequested = false;
            this._jumpDirty = true;
        });
        this._bindJump();
    }

    private _bindJump(): void {
        if (!this._jumpDirty) return;
        this._jumpBinding?.unbind();
        this._jumpBinding = this.inputs.onTrigger(this._jumpChannel, () => {
            this._jumpVelocity = -260;
        });
        this._jumpDirty = false;
    }

    override update(delta): void {
        this._bindJump();
        this._sprite.move(0, this._jumpVelocity * delta.seconds);
        this._jumpVelocity = Math.min(0, this._jumpVelocity + 760 * delta.seconds);
        if (this._sprite.position.y > 300) this._sprite.position.y = 300;
        this._text.text = `Press J to rebind jump\nCurrent jump channel: ${this._jumpChannel}`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
        context.render(this._text);
    }
}

app.start(new KeyRebindingScene());
