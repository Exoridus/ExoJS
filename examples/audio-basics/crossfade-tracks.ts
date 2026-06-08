import { assets } from '@assets';
import { Application, Color, crossFade, Music, Scene, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class CrossfadeTracksScene extends Scene {
    private trackA!: Music;
    private trackB!: Music;
    private toB = true;
    private text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Music, { a: assets.demo.audio.musicA, b: assets.demo.audio.musicB });
    }

    override init(loader): void {
        this.trackA = loader.get(Music, 'a').setLoop(true).setVolume(0.7).play();
        this.trackB = loader.get(Music, 'b').setLoop(true).setVolume(0).play();
        this.text = new Text('Click to crossfade tracks over 2s', { fillColor: Color.white, fontSize: 24 });
        this.text.setPosition(170, 280);

        this.app.input.onPointerTap.add(() => {
            if (this.toB) {
                void crossFade(this.trackA, this.trackB, 2000, { stopAfterFade: false });
            } else {
                void crossFade(this.trackB, this.trackA, 2000, { stopAfterFade: false });
            }
            this.toB = !this.toB;
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.text);
    }
}

app.start(new CrossfadeTracksScene());
