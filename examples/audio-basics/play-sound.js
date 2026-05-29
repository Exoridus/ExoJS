import { Application, Color, Scene, Sound, Text } from '@codexo/exojs';

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
            await loader.load(Sound, { click: 'audio/example.ogg' });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'click');
            this._text = new Text('Click anywhere to play SFX', { fill: 'white', fontSize: 24 });
            this._text.setPosition(220, 280);
            this.app.input.onPointerTap.add(() => {
                this._sound.play();
            });
        }
        draw(context) {
            context.backend.clear();
            context.render(this._text);
        }
    })()
);
