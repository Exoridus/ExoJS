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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
            this._text = new Text('', { fill: 'white', fontSize: 18, lineHeight: 24, padding: 8 });
            this._text.setPosition(20, 20);
            this._jumpChannel = Keyboard.Space;
            this._rebindRequested = false;
            this._jumpDirty = true;
            this._jumpVelocity = 0;

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
        _bindJump() {
            if (!this._jumpDirty) return;
            this._jumpBinding?.unbind();
            this._jumpBinding = this.inputs.onTrigger(this._jumpChannel, () => {
                this._jumpVelocity = -260;
            });
            this._jumpDirty = false;
        }
        update(delta) {
            this._bindJump();
            this._sprite.move(0, this._jumpVelocity * delta.seconds);
            this._jumpVelocity = Math.min(0, this._jumpVelocity + 760 * delta.seconds);
            if (this._sprite.position.y > 300) this._sprite.position.y = 300;
            this._text.text = `Press J to rebind jump\nCurrent jump channel: ${this._jumpChannel}`;
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
            this._text.render(backend);
        }
    })()
);
