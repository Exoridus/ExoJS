import { Application, Color, Scene, Text, Time } from '@codexo/exojs';

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
            await loader.load(FontFace, { example: 'font/Kenney Future.ttf' }, { family: 'Kenney Future' });
        }
        init() {
            const { width, height } = this.app.canvas;

            this._time = new Time();

            this._text = new Text('Hello World!', {
                align: 'left',
                fill: 'white',
                stroke: 'black',
                strokeThickness: 3,
                fontSize: 25,
                fontFamily: 'Kenney Future',
            });

            this._text.setPosition(width / 2, height / 2);
            this._text.setAnchor(0.5, 0.5);
        }
        update(delta) {
            this._text.text = `Hello World! ${this._time.addTime(delta).seconds | 0}`;
            this._text.rotate(delta.seconds * 36);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._text);
        }
    })()
);
