import { Application, Color, Container, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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

class LocalVsGlobalTransformScene extends Scene {
    private _parent!: Container;
    private _localSprite!: Sprite;
    private _globalSprite!: Sprite;
    private _localLabel!: Text;
    private _globalLabel!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const texture = loader.get(Texture, 'bunny');

        this._parent = new Container().setPosition(250, 300);
        this._localSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition(120, 0)
            .setTint(new Color(120, 190, 255));
        this._globalSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition(580, 300)
            .setTint(new Color(255, 190, 120));
        this._parent.addChild(this._localSprite);

        this._localLabel = new Text('inherited rotation', { fillColor: Color.white, fontSize: 16 });
        this._localLabel.setPosition(180, 80);
        this._globalLabel = new Text('screen-space', { fillColor: Color.white, fontSize: 16 });
        this._globalLabel.setPosition(520, 80);
    }

    override update(delta): void {
        this._parent.rotate(delta.seconds * 60);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._parent);
        context.render(this._globalSprite);
        context.render(this._localLabel);
        context.render(this._globalLabel);
    }
}

app.start(new LocalVsGlobalTransformScene());
