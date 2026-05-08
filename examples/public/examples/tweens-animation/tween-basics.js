import { Application, Color, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(120, 300);
            this._text = new Text('Tween running', { fill: 'white', fontSize: 18 });
            this._text.setPosition(20, 20);
            this._forward = this.app.tweens.create(this._sprite.position).to({ x: 680 }, 1.2);
            this._backward = this.app.tweens.create(this._sprite.position).to({ x: 120 }, 1.2);
            this._forward
                .onComplete(() => {
                    this._text.setText('Completed -> reverse');
                    this._backward.start();
                })
                .start();
            this._backward.onComplete(() => {
                this._text.setText('Completed -> forward');
                this._forward.start();
            });
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
            this._text.render(backend);
        }
    })()
);
