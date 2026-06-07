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
    private sprite!: Sprite;
    private text!: Text;
    private jumpChannel = Keyboard.Space;
    private rebindRequested = false;
    private jumpDirty = true;
    private jumpVelocity = 0;
    private jumpBinding: { unbind(): void } | undefined;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this.text = new Text('', { fillColor: Color.white, fontSize: 18, lineHeight: 24 });
        this.text.setPosition(20, 20);

        this.inputs.onTrigger(Keyboard.J, () => {
            this.rebindRequested = true;
        });
        this.app.input.onKeyDown.add(channel => {
            if (!this.rebindRequested) return;
            this.jumpChannel = channel;
            this.rebindRequested = false;
            this.jumpDirty = true;
        });
        this.bindJump();
    }

    private bindJump(): void {
        if (!this.jumpDirty) return;
        this.jumpBinding?.unbind();
        this.jumpBinding = this.inputs.onTrigger(this.jumpChannel, () => {
            this.jumpVelocity = -260;
        });
        this.jumpDirty = false;
    }

    override update(delta): void {
        this.bindJump();
        this.sprite.move(0, this.jumpVelocity * delta.seconds);
        this.jumpVelocity = Math.min(0, this.jumpVelocity + 760 * delta.seconds);
        if (this.sprite.position.y > 300) this.sprite.position.y = 300;
        this.text.text = `Press J to rebind jump\nCurrent jump channel: ${this.jumpChannel}`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.text);
    }
}

app.start(new KeyRebindingScene());
