// Auto-generated from tween-basics.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, Text, Texture } from '@codexo/exojs';
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
class TweenBasicsScene extends Scene {
    sprite;
    text;
    forward;
    backward;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(120, 300);
        this.text = new Text('Tween running', { fillColor: Color.white, fontSize: 18 });
        this.text.setPosition(20, 20);
        this.forward = this.app.tweens.create(this.sprite.position).to({ x: 680 }, 1.2);
        this.backward = this.app.tweens.create(this.sprite.position).to({ x: 120 }, 1.2);
        this.forward
            .onComplete(() => {
            this.text.text = 'Completed -> reverse';
            this.backward.start();
        })
            .start();
        this.backward.onComplete(() => {
            this.text.text = 'Completed -> forward';
            this.forward.start();
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.text);
    }
}
app.start(new TweenBasicsScene());
