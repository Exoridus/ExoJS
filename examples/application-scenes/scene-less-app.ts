import { Application, Color, type RenderingContext, Sprite } from '@codexo/exojs';

// A scene-less Application: no Scene is ever registered or started. All
// frame work happens through a single app-level system — useful for utility
// apps, splash/loading screens, or anything that doesn't need scene
// lifecycle, retention, or navigation. Assets load the same way without a
// Scene: `app.loader` in place of `this.loader`.

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(18, 22, 33),
});

const square = new Sprite(app.loader.get(assets.demo.textures.pixelWhite)).setAnchor(0.5);
square.width = 80;
square.height = 80;
square.tint = new Color(90, 160, 255);
square.setPosition(app.canvas.width / 2, app.canvas.height / 2);

let angle = 0;

app.systems.add({
    update(delta) {
        angle += delta.seconds;
        square.rotation = angle * 40;
    },
    draw(context: RenderingContext) {
        context.backend.clear();
        context.render(square);
    },
});

app.start();
