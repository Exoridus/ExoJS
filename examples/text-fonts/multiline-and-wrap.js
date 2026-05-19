import { Application, Color, Scene, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 980,
        height: 620,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

const paragraph = 'ExoJS text layout can render multiline content with configurable wrapping behavior and style.';

app.start(
    new (class extends Scene {
        init() {
            this._titleA = new Text('No wrap', { fill: 'white', fontSize: 16 });
            this._titleA.setPosition(40, 80);
            this._textA = new Text(paragraph, { fill: 'white', fontSize: 24, wordWrap: false });
            this._textA.setPosition(40, 110);

            this._titleB = new Text('Word wrap 300', { fill: 'white', fontSize: 16 });
            this._titleB.setPosition(360, 80);
            this._textB = new Text(paragraph, { fill: 'white', fontSize: 24, wordWrap: true, wordWrapWidth: 300 });
            this._textB.setPosition(360, 110);

            this._titleC = new Text('Character-like wrap', { fill: 'white', fontSize: 16 });
            this._titleC.setPosition(680, 80);
            this._textC = new Text('ExoJStextlayoutcanrendermultilinecontentwithconfigurablewrappingbehaviorandstyle.', {
                fill: 'white',
                fontSize: 24,
                wordWrap: true,
                wordWrapWidth: 240,
            });
            this._textC.setPosition(680, 110);
        }
        draw(backend) {
            backend.clear();
            this._titleA.render(backend);
            this._titleB.render(backend);
            this._titleC.render(backend);
            this._textA.render(backend);
            this._textB.render(backend);
            this._textC.render(backend);
        }
    })()
);
