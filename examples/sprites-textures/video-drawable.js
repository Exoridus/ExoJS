// Auto-generated from video-drawable.ts — edit the .ts source, not this file.
import { video } from '@assets';
import { Application, Color, Scene, Video } from '@codexo/exojs';
const VIDEO_URL = video.demoLoop;
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class VideoDrawableScene extends Scene {
    _video;
    async load(loader) {
        await loader.load(Video, { demo: VIDEO_URL });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this._video = loader.get(Video, 'demo');
        this._video.width = width;
        this._video.height = height;
        this._video.applyOptions({ loop: true, muted: false, volume: 0.5 });
        this.app.input.onPointerTap.add(() => { this._video.toggle(); });
    }
    draw(context) {
        context.backend.clear();
        context.render(this._video);
    }
}
app.start(new VideoDrawableScene());
