// Auto-generated from custom-render-pass.ts — edit the .ts source, not this file.
import { Application, CallbackRenderPass, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';
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
class CustomRenderPassScene extends Scene {
    back;
    front;
    between;
    angle = 0;
    pass;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.back = new Sprite(loader.get(Texture, 'bunny'))
            .setAnchor(0.5)
            .setPosition(280, 300)
            .setScale(2.2)
            .setTint(new Color(120, 170, 255));
        this.front = new Sprite(loader.get(Texture, 'bunny'))
            .setAnchor(0.5)
            .setPosition(520, 300)
            .setScale(2.2)
            .setTint(new Color(255, 180, 120));
        this.between = new Graphics();
        this.pass = new CallbackRenderPass(backend => {
            this.between.clear();
            this.between.lineWidth = 10;
            this.between.lineColor = new Color(130, 240, 170);
            this.between.drawArc(400, 300, 120, this.angle, this.angle + Math.PI * 1.3);
            this.between.render(backend);
        });
    }
    update(delta) {
        this.angle += delta.seconds * 2.2;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.back);
        context.backend.execute(this.pass);
        context.render(this.front);
    }
}
app.start(new CustomRenderPassScene());
