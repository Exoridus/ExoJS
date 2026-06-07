// Auto-generated from picture-in-picture.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Sprite, Texture, View } from '@codexo/exojs';
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
class PictureInPictureScene extends Scene {
    mainView;
    pipView;
    sprite;
    velocity = 220;
    frame;
    async load(loader) {
        this.sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }
    init() {
        const { width, height } = this.app.canvas;
        this.mainView = new View(0, 0, width, height);
        this.pipView = new View(0, 0, width * 0.3, height * 0.3);
        this.pipView.viewport.set(0.68, 0.04, 0.28, 0.28);
        this.pipView.setZoom(2.2);
        this.sprite.setAnchor(0.5).setPosition(-280, 0);
        this.frame = new Graphics();
        this.frame.lineWidth = 3;
        this.frame.lineColor = Color.white;
        this.frame.drawRectangle(width * 0.68, height * 0.04, width * 0.28, height * 0.28);
    }
    update(delta) {
        this.sprite.move(this.velocity * delta.seconds, 0);
        if (this.sprite.position.x > 320 || this.sprite.position.x < -320) {
            this.velocity *= -1;
        }
        this.pipView.follow(this.sprite, { lerp: 1 });
    }
    draw(context) {
        context.backend.clear();
        context.backend.setView(this.mainView);
        context.render(this.sprite);
        context.backend.setView(this.pipView);
        context.render(this.sprite);
        context.backend.setView(null);
        context.render(this.frame);
    }
}
app.start(new PictureInPictureScene());
