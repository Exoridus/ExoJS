import { Application, Color, Keyboard, type RenderingContext, Scene, Sprite, Text, type Time } from '@codexo/exojs';

const app = new Application({
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

class PauseResumeScene extends Scene {
    private sprite!: Sprite;
    private label!: Text;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);

        this.label = new Text('Space or click: pause update', { fillColor: Color.white, fontSize: 16 });
        this.label.setAnchor(0.5, 0);
        this.label.setPosition(width / 2, 16);

        this.inputs.onTrigger(Keyboard.Space, () => {
            // scene.paused skips update() + systems each frame; drawing continues.
            this.paused = !this.paused;
            this.label.text = this.paused ? 'Paused (draw running)' : 'Running';
        });

        // Same toggle on click/tap so the pause works without a keyboard.
        app.input.onPointerTap.add(() => {
            // scene.paused skips update() + systems each frame; drawing continues.
            this.paused = !this.paused;
            this.label.text = this.paused ? 'Paused (draw running)' : 'Running';
        });
    }

    override update(delta: Time): void {
        // Not called while paused — the SceneManager skips a paused scene's update().
        this.sprite.rotate(delta.seconds * 180);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.label);
    }
}

app.start(new PauseResumeScene());
