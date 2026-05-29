import { Application, Color, Graphics, RenderTargetPass, RenderTexture, Scene, Sprite } from '@codexo/exojs';

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
        init() {
            this._world = new Graphics();
            this._player = new Graphics();
            this._miniRt = new RenderTexture(220, 160);
            this._miniSprite = new Sprite(this._miniRt).setPosition(560, 20);
            this._miniFrame = new Graphics();
            this._time = 0;
        }
        update(delta) {
            this._time += delta.seconds;
        }
        _renderWorld(backend) {
            this._world.clear();
            this._world.lineWidth = 2;
            this._world.lineColor = new Color(60, 70, 90);
            for (let x = 80; x <= 720; x += 80) this._world.drawLine(x, 60, x, 540);
            for (let y = 60; y <= 540; y += 80) this._world.drawLine(80, y, 720, y);
            this._world.render(backend);

            const x = 400 + Math.cos(this._time) * 250;
            const y = 300 + Math.sin(this._time * 1.3) * 180;
            this._player.clear();
            this._player.fillColor = new Color(255, 180, 100);
            this._player.drawCircle(x, y, 18);
            this._player.render(backend);
        }
        draw(context) {
            context.backend.execute(
                new RenderTargetPass(
                    () => {
                        context.backend.clear();
                        this._renderWorld(context.backend);
                    },
                    { target: this._miniRt, view: this._miniRt.view }
                )
            );
            context.backend.clear();
            this._renderWorld(context.backend);
            context.render(this._miniSprite);
            this._miniFrame.clear();
            this._miniFrame.lineWidth = 2;
            this._miniFrame.lineColor = Color.white;
            this._miniFrame.drawRectangle(560, 20, 220, 160);
            context.render(this._miniFrame);
        }
    })()
);
