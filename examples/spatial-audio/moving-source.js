import { Application, Color, Graphics, Scene, Sound, Text } from '@codexo/exojs';

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
            await loader.load(Sound, { tone: 'audio/impact-light.ogg' });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'tone');
            this._sound.position = { x: 560, y: 300 };
            this._sound.setLoop(true).setVolume(1).play();
            this._listener = { x: 400, y: 300 };
            app.audio.listener.target = this._listener;
            this._angle = 0;
            this._graphics = new Graphics();
            this._text = new Text('Auto-circling spatial source', { fillColor: Color.white, fontSize: 20 });
            this._text.setPosition(230, 20);
        }
        update(delta) {
            this._angle += delta.seconds * 1.1;
            this._sound.position = {
                x: this._listener.x + Math.cos(this._angle) * 210,
                y: this._listener.y + Math.sin(this._angle) * 120,
            };
        }
        draw(context) {
            context.backend.clear();
            this._graphics.clear();
            this._graphics.fillColor = new Color(120, 255, 160);
            this._graphics.drawCircle(this._listener.x, this._listener.y, 12);
            this._graphics.fillColor = new Color(255, 150, 120);
            this._graphics.drawCircle(this._sound.position.x, this._sound.position.y, 16);
            context.render(this._graphics);
            context.render(this._text);
        }
    })()
);
