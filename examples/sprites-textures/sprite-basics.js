// Auto-generated from sprite-basics.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';
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
class SpriteBasicsScene extends Scene {
    bunny;
    tints;
    tintIndex = 0;
    tintTime = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.bunny = new Sprite(loader.get(Texture, 'bunny'));
        this.bunny.setPosition((width / 2) | 0, (height / 2) | 0);
        this.bunny.setAnchor(0.5);
        this.tints = [new Color(255, 120, 120), new Color(120, 255, 160), new Color(120, 180, 255)];
        this.bunny.setTint(this.tints[this.tintIndex]);
    }
    update(delta) {
        this.bunny.rotate(delta.seconds * 360);
        this.tintTime += delta.seconds;
        if (this.tintTime >= 0.5) {
            this.tintTime = 0;
            this.tintIndex = (this.tintIndex + 1) % this.tints.length;
            this.bunny.setTint(this.tints[this.tintIndex]);
        }
    }
    draw(context) {
        context.backend.clear();
        context.render(this.bunny);
    }
}
app.start(new SpriteBasicsScene());
