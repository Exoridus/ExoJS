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
            this._rt = new RenderTexture(260, 260);
            this._mini = new Sprite(this._rt).setPosition(530, 20).setScale(1);
            this._mask = new Graphics();
            this._mask.fillColor = Color.white;
            this._mask.drawCircle(660, 150, 120);
            this._mini.mask = this._mask;
            this._frame = new Graphics();
            this._time = 0;
        }
        update(delta) {
            this._time += delta.seconds;
        }
        _drawWorld(backend) {
            this._world.clear();
            this._world.lineWidth = 2;
            this._world.lineColor = new Color(60, 70, 90);
            for (let x = 80; x <= 720; x += 80) this._world.drawLine(x, 60, x, 540);
            for (let y = 60; y <= 540; y += 80) this._world.drawLine(80, y, 720, y);
            this._world.render(backend);
            this._player.clear();
            this._player.fillColor = new Color(255, 170, 110);
            this._player.drawCircle(400 + Math.cos(this._time) * 230, 300 + Math.sin(this._time * 1.2) * 170, 18);
            this._player.render(backend);
        }
        draw(backend) {
            backend.execute(
                new RenderTargetPass(
                    () => {
                        backend.clear();
                        this._drawWorld(backend);
                    },
                    { target: this._rt, view: this._rt.view }
                )
            );
            backend.clear();
            this._drawWorld(backend);
            this._mini.render(backend);
            this._frame.clear();
            this._frame.lineWidth = 3;
            this._frame.lineColor = Color.white;
            this._frame.drawCircle(660, 150, 120);
            this._frame.render(backend);
        }
    })()
);
