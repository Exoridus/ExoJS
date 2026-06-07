// Auto-generated from crossfade-tracks.ts — edit the .ts source, not this file.
import { audio } from '@assets';
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
    trackA;
    trackB;
    toB = true;
    text;
    async load(loader) {
        await loader.load(Music, { a: audio.musicA, b: audio.musicB });
    }
    init(loader) {
        this.trackA = loader.get(Music, 'a').setLoop(true).setVolume(0.7).play();
        this.trackB = loader.get(Music, 'b').setLoop(true).setVolume(0).play();
        this.text = new Text('Click to crossfade tracks over 2s', { fillColor: Color.white, fontSize: 24 });
        this.text.setPosition(170, 280);
        this.app.input.onPointerTap.add(() => {
            if (this.toB) {
                void crossFade(this.trackA, this.trackB, 2000, { stopAfterFade: false });
            }
            else {
                void crossFade(this.trackB, this.trackA, 2000, { stopAfterFade: false });
            }
            this.toB = !this.toB;
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new CrossfadeTracksScene());
