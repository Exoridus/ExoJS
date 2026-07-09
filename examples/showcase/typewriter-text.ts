import { Application, Color, Scene, Sound, Text } from '@codexo/exojs';

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

const message = 'ExoJS gives you explicit rendering control with a compact scene and asset workflow.';

class TypewriterTextScene extends Scene {
    private sound!: Sound;
    private text!: Text;
    private state!: { count: number };
    private last = 0;
    private tapPrompt!: Text;

    override async load(loader): Promise<void> {
        await loader.load('audio/ui-click.ogg');
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.sound = loader.get('audio/ui-click.ogg');
        this.text = new Text('', { fillColor: Color.white, fontSize: 40, lineHeight: 56, maxWidth: 900 });
        this.text.setAnchor(0, 0.5).setPosition(width * 0.12, height / 2);
        this.state = { count: 0 };

        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued tick sounds play.
        this.tapPrompt = new Text('Click or press any key to enable the typing sound', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);
        this.app.tweens
            .create(this.state)
            .to({ count: message.length }, 2.4)
            .onUpdate(() => {
                const n = this.state.count | 0;
                if (n > this.last) this.app.audio.play(this.sound, { playbackRate: 1.6 });
                this.last = n;
                this.text.text = message.slice(0, n);
            })
            .start();
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.text);

        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}

app.start(new TypewriterTextScene());
