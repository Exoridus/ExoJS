// Auto-generated from pause-and-resume.ts — edit the .ts source, not this file.
import { Application, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';
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
class PauseResumeScene extends Scene {
    paused = false;
    sprite;
    label;
    async load(loader) {
        this.sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }
    init() {
        const { width, height } = this.app.canvas;
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
        this.label = new Text('Space: pause update', { fillColor: Color.white, fontSize: 16 });
        this.label.setAnchor(0.5, 0);
        this.label.setPosition(width / 2, 16);
        this.inputs.onTrigger(Keyboard.Space, () => {
            this.paused = !this.paused;
            this.label.text = this.paused ? 'Paused (draw running)' : 'Running';
        });
    }
    update(delta) {
        if (this.paused) {
            return;
        }
        this.sprite.rotate(delta.seconds * 180);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.label);
    }
}
app.start(new PauseResumeScene());
