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
            await loader.load(Sound, { source: 'audio/example.ogg' });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'source');
            this._sound.position = { x: 560, y: 300 };
            this._sound.setLoop(true).setVolume(1).play();
            this._dragging = false;
            this._listener = { x: 400, y: 300 };
            app.audio.listener.target = this._listener;

            this._graphics = new Graphics();
            this._label = new Text('', { fill: 'white', fontSize: 17 });
            this._label.setPosition(20, 20);

            this.app.input.onPointerDown.add(pointer => {
                const dx = pointer.x - this._sound.position.x;
                const dy = pointer.y - this._sound.position.y;
                if (dx * dx + dy * dy < 900) this._dragging = true;
            });
            this.app.input.onPointerMove.add(pointer => {
                if (!this._dragging) return;
                this._sound.position = { x: pointer.x, y: pointer.y };
            });
            this.app.input.onPointerUp.add(() => {
                this._dragging = false;
            });
        }
        draw(backend) {
            const dx = this._sound.position.x - this._listener.x;
            const dy = this._sound.position.y - this._listener.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            this._label.setText(`Drag source circle  distance: ${dist.toFixed(0)}`);

            backend.clear();
            this._graphics.clear();
            this._graphics.fillColor = new Color(120, 255, 160);
            this._graphics.drawCircle(this._listener.x, this._listener.y, 14);
            this._graphics.fillColor = new Color(255, 140, 140);
            this._graphics.drawCircle(this._sound.position.x, this._sound.position.y, 18);
            this._graphics.render(backend);
            this._label.render(backend);
        }
    })()
);
