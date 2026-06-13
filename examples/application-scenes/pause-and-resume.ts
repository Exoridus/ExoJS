import { Application, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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
    private paused = false;
    private sprite!: Sprite;
    private label!: Text;

    override async load(loader): Promise<void> {
        this.sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }

    override init(): void {
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

    override update(delta): void {
        if (this.paused) {
            return;
        }

        this.sprite.rotate(delta.seconds * 180);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.label);
    }
}

app.start(new PauseResumeScene());
