import { Application, Color, Scene, Time, Text } from 'exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(Scene.create({

    async load(loader) {
        await loader.load(FontFace, { example: 'font/AndyBold.woff2' }, { family: 'AndyBold' });
    },

    init() {
        const { width, height } = this.app.canvas;

        this._time = new Time();

        this._text = new Text('Hello World!', {
            align: 'left',
            fill: 'white',
            stroke: 'black',
            strokeThickness: 3,
            fontSize: 25,
            fontFamily: 'AndyBold',
        });

        this._text.setPosition(width / 2, height / 2);
        this._text.setAnchor(0.5, 0.5);
    },

    update(delta) {
        this._text
            .setText(`Hello World! ${this._time.addTime(delta).seconds | 0}`)
            .rotate(delta.seconds * 36);
    },

    draw(renderManager) {
        renderManager.clear();
        this._text.render(renderManager);
    },
}));
