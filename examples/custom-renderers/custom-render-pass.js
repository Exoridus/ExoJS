import { Application, CallbackRenderPass, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';

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
            this._back = new Sprite(loader.get(Texture, 'bunny'))
                .setAnchor(0.5)
                .setPosition(280, 300)
                .setScale(2.2)
                .setTint(new Color(120, 170, 255));
            this._front = new Sprite(loader.get(Texture, 'bunny'))
                .setAnchor(0.5)
                .setPosition(520, 300)
                .setScale(2.2)
                .setTint(new Color(255, 180, 120));
            this._between = new Graphics();
            this._angle = 0;
            this._pass = new CallbackRenderPass(backend => {
                this._between.clear();
                this._between.lineWidth = 10;
                this._between.lineColor = new Color(130, 240, 170);
                this._between.drawArc(400, 300, 120, this._angle, this._angle + Math.PI * 1.3);
                this._between.render(backend);
            });
        }
        update(delta) {
            this._angle += delta.seconds * 2.2;
        }
        draw(context) {
            context.backend.clear();
            context.render(this._back);
            context.backend.execute(this._pass);
            context.render(this._front);
        }
    })()
);
