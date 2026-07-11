import { Application, Color, Container, type RenderingContext, Scene, Sprite, Text, type Time } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

class LocalVsGlobalTransformScene extends Scene {
    private parent!: Container;
    private localSprite!: Sprite;
    private globalSprite!: Sprite;
    private localLabel!: Text;
    private globalLabel!: Text;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const texture = this.loader.get('image/ship-a.png');

        this.parent = new Container().setPosition(width / 4, height / 2);
        this.localSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition(160, 0)
            .setTint(new Color(120, 190, 255));
        this.globalSprite = new Sprite(texture)
            .setAnchor(0.5)
            .setScale(0.8)
            .setPosition((width * 3) / 4, height / 2)
            .setTint(new Color(255, 190, 120));
        this.parent.addChild(this.localSprite);

        this.localLabel = new Text('inherited rotation', { fillColor: Color.white, fontSize: 16 });
        this.localLabel.setPosition(width / 4 - 60, height / 2 - 220);
        this.globalLabel = new Text('screen-space', { fillColor: Color.white, fontSize: 16 });
        this.globalLabel.setPosition((width * 3) / 4 - 50, height / 2 - 220);
    }

    override update(delta: Time): void {
        this.parent.rotate(delta.seconds * 60);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.parent);
        context.render(this.globalSprite);
        context.render(this.localLabel);
        context.render(this.globalLabel);
    }
}

app.start(new LocalVsGlobalTransformScene());
