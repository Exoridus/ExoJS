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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
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

            this._localLabel = new Text('inherited rotation', { fill: 'white', fontSize: 16 });
            this._localLabel.setPosition(180, 80);
            this._globalLabel = new Text('screen-space', { fill: 'white', fontSize: 16 });
            this._globalLabel.setPosition(520, 80);
        }
        update(delta) {
            this._parent.rotate(delta.seconds * 60);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._parent);
            context.render(this._globalSprite);
            context.render(this._localLabel);
            context.render(this._globalLabel);
        }
    })()
);
