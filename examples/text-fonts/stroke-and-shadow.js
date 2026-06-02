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
            // TextStyle rasterizes glyphs as SDFs, so the outline (stroke) and
            // drop shadow are produced natively in the shader — no need to stack
            // a second offset Text behind the title.
            //
            // `outlineWidth` is measured in SDF units (0..0.5), not pixels.
            // `shadowAlpha` > 0 enables the shadow; `shadowBlur` softens its edge.
            this._title = new Text('EXOJS', {
                fillColor: new Color(230, 240, 255),
                fontSize: 120,
                outlineColor: new Color(70, 130, 220),
                outlineWidth: 0.3,
                shadowColor: Color.black,
                shadowAlpha: 0.6,
                shadowOffsetX: 6,
                shadowOffsetY: 6,
                shadowBlur: 0.4,
            });
            this._title.setPosition(180, 190);
        }
        draw(context) {
            context.backend.clear(new Color(24, 28, 42));
            context.render(this._title);
        }
    })()
);
