import { Application, Color, Container, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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

class ZOrderingScene extends Scene {
    private _group!: Container;
    private _label!: Text;
    private _sprites!: Sprite[];

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._group = new Container();
        this._label = new Text('Press 1, 2, 3', { fillColor: Color.white, fontSize: 18 });
        this._label.setPosition(18, 18);

        this._sprites = [0, 1, 2].map(index => {
            const sprite = new Sprite(loader.get(Texture, 'bunny'))
                .setAnchor(0.5)
                .setScale(0.9)
                .setPosition(340 + index * 60, 300);
            sprite.setTint([new Color(255, 120, 120), new Color(120, 255, 170), new Color(120, 170, 255)][index]);
            sprite.zIndex = index;
            this._group.addChild(sprite);
            return sprite;
        });

        this.inputs.onTrigger(Keyboard.One, () => this._setFront(0));
        this.inputs.onTrigger(Keyboard.Two, () => this._setFront(1));
        this.inputs.onTrigger(Keyboard.Three, () => this._setFront(2));
    }

    private _setFront(index: number): void {
        this._sprites.forEach((sprite, i) => {
            sprite.zIndex = i === index ? 3 : i;
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._group);
        context.render(this._label);
    }
}

app.start(new ZOrderingScene());
