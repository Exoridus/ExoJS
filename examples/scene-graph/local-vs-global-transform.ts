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
    private parent!: Container;
    private localSprite!: Sprite;
    private globalSprite!: Sprite;
    private localLabel!: Text;
    private globalLabel!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const texture = loader.get(Texture, 'bunny');

        this.parent = new Container().setPosition(250, 300);
        this.localSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition(120, 0)
            .setTint(new Color(120, 190, 255));
        this.globalSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition(580, 300)
            .setTint(new Color(255, 190, 120));
        this.parent.addChild(this.localSprite);

        this.localLabel = new Text('inherited rotation', { fillColor: Color.white, fontSize: 16 });
        this.localLabel.setPosition(180, 80);
        this.globalLabel = new Text('screen-space', { fillColor: Color.white, fontSize: 16 });
        this.globalLabel.setPosition(520, 80);
    }

    override update(delta): void {
        this.parent.rotate(delta.seconds * 60);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.parent);
        context.render(this.globalSprite);
        context.render(this.localLabel);
        context.render(this.globalLabel);
    }
}

app.start(new LocalVsGlobalTransformScene());
