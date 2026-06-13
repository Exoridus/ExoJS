import { Application, Color, Scene, Sound, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

class PlaySoundScene extends Scene {
    private sound!: Sound;
    private text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { click: assets.demo.audio.uiClick });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.sound = loader.get(Sound, 'click');
        this.text = new Text('Click anywhere to play SFX', { fillColor: Color.white, fontSize: 24, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height / 2);
        this.app.input.onPointerTap.add(() => {
            this.sound.play();
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.text);
    }
}

app.start(new PlaySoundScene());
