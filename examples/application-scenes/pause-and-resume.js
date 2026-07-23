// Auto-generated from pause-and-resume.ts — edit the .ts source, not this file.
import { Application, Color, Keyboard, Scene, Sprite, Text } from '@codexo/exojs';
class PauseResumeScene extends Scene {
    sprite;
    label;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
        this.label = new Text('Space or click: pause update', { fillColor: Color.white, fontSize: 16 });
        this.label.setAnchor(0.5, 0);
        this.label.setPosition(width / 2, 16);
        this.inputs.onTrigger(Keyboard.Space, () => {
            this.toggle();
        });
        // Same toggle on click/tap so the pause works without a keyboard.
        app.input.onPointerTap.add(() => {
            this.toggle();
        });
    }
    toggle() {
        if (this.app.scenes.paused) {
            this.app.scenes.resume();
        }
        else {
            this.app.scenes.pause();
        }
        this.label.text = this.app.scenes.paused ? 'Paused (draw running)' : 'Running';
    }
    update(delta) {
        this.sprite.rotate(delta.seconds * 180);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.label);
    }
}
const app = new Application({
    scenes: { PauseResumeScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
app.start(PauseResumeScene);
