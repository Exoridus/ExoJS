import { Application, Color, Container, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
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
        draw(backend) {
            backend.clear();
            this._parent.render(backend);
            this._globalSprite.render(backend);
            this._localLabel.render(backend);
            this._globalLabel.render(backend);
        }
    })()
);
