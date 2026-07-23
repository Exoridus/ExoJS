// Auto-generated from scene-less-app.ts — edit the .ts source, not this file.
import { Application, Color, Graphics } from '@codexo/exojs';
// A scene-less Application: no Scene is ever registered or started. All
// frame work happens through a single app-level system — useful for utility
// apps, splash/loading screens, or anything that doesn't need scene
// lifecycle, retention, or navigation.
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(18, 22, 33),
});
const square = new Graphics();
square.fillColor = new Color(90, 160, 255);
square.drawRectangle(-40, -40, 80, 80);
square.setPosition(app.canvas.width / 2, app.canvas.height / 2);
let angle = 0;
app.systems.add({
    update(delta) {
        angle += delta.seconds;
        square.rotation = angle * 40;
    },
    draw(context) {
        context.backend.clear();
        context.render(square);
    },
});
app.start();
