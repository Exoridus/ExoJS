import { Application, Color, Scene, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 900,
        height: 520,
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
            this._shadow = new Text('EXOJS', {
                fill: 'rgba(0,0,0,0.5)',
                fontSize: 120,
                stroke: 'rgba(0,0,0,0.5)',
                strokeThickness: 8,
            });
            this._shadow.setPosition(178, 210);
            this._title = new Text('EXOJS', {
                fill: 'rgb(230,240,255)',
                fontSize: 120,
                stroke: 'rgb(70,130,220)',
                strokeThickness: 8,
            });
            this._title.setPosition(170, 200);
        }
        draw(context) {
            context.backend.clear(new Color(24, 28, 42));
            context.render(this._shadow);
            context.render(this._title);
        }
    })()
);
