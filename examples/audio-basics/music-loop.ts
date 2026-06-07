import { audio } from '@assets';
import { Application, Color, crossFade, Graphics, Music, Scene, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class MusicLoopScene extends Scene {
    private music!: Music;
    private silent!: Music;
    private ui!: Graphics;
    private text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Music, { track: audio.musicLoop, silent: audio.musicLoop });
    }

    override init(loader): void {
        this.music = loader.get(Music, 'track');
        this.music.setLoop(true).setVolume(0.7).play();
        this.silent = loader.get(Music, 'silent');
        this.silent.setVolume(0).setLoop(true).play();

        this.ui = new Graphics();
        this.text = new Text('Click left: fade-in    Click right: fade-out', { fillColor: Color.white, fontSize: 18 });
        this.text.setPosition(160, 220);
        this.app.input.onPointerTap.add(pointer => {
            if (pointer.x < 400) {
                void crossFade(this.silent, this.music, 900, { stopAfterFade: false });
            } else {
                void crossFade(this.music, this.silent, 900, { stopAfterFade: false });
            }
        });
    }

    override draw(context): void {
        context.backend.clear();
        this.ui.clear();
        this.ui.fillColor = new Color(70, 130, 220);
        this.ui.drawRectangle(120, 280, 240, 70);
        this.ui.fillColor = new Color(220, 90, 90);
        this.ui.drawRectangle(440, 280, 240, 70);
        context.render(this.ui);
        context.render(this.text);
    }
}

app.start(new MusicLoopScene());
