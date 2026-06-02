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
const longToken = 'ExoJStextlayoutrendersaverylongunbrokentokenwithoutanyspacestobreakon';

const titleColor = new Color(140, 170, 210);

app.start(
    new (class extends Scene {
        init() {
            // Wrapping is a layout concern, not a style one: pass `maxWidth`
            // (and `breakWords`) as the third Text argument — the layout options.

            // No layout width → a single line that overflows the canvas bounds.
            this._titleA = new Text('No wrap — single line overflows the bounds', { fillColor: titleColor, fontSize: 16 });
            this._titleA.setPosition(40, 50);
            this._textA = new Text(paragraph, { fillColor: Color.white, fontSize: 24 });
            this._textA.setPosition(40, 80);

            // maxWidth → wraps at word boundaries.
            this._titleB = new Text('Word wrap @ 320px — breaks at word boundaries', { fillColor: titleColor, fontSize: 16 });
            this._titleB.setPosition(40, 220);
            this._textB = new Text(paragraph, { fillColor: Color.white, fontSize: 24 }, { maxWidth: 320 });
            this._textB.setPosition(40, 250);

            // breakWords → splits a single long token across lines.
            this._titleC = new Text('Break words @ 240px — splits a long token', { fillColor: titleColor, fontSize: 16 });
            this._titleC.setPosition(40, 430);
            this._textC = new Text(longToken, { fillColor: Color.white, fontSize: 24 }, { maxWidth: 240, breakWords: true });
            this._textC.setPosition(40, 460);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._titleA);
            context.render(this._titleB);
            context.render(this._titleC);
            context.render(this._textA);
            context.render(this._textB);
            context.render(this._textC);
        }
    })()
);
