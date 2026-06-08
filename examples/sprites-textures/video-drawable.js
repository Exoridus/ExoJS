// Auto-generated from video-drawable.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Video } from '@codexo/exojs';
const VIDEO_URL = assets.demo.video.demoLoop;
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class VideoDrawableScene extends Scene {
    video;
    async load(loader) {
        await loader.load(Video, { demo: VIDEO_URL });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.video = loader.get(Video, 'demo');
        this.video.width = width;
        this.video.height = height;
        this.video.applyOptions({ loop: true, muted: false, volume: 0.5 });
        this.app.input.onPointerTap.add(() => { this.video.toggle(); });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.video);
    }
}
app.start(new VideoDrawableScene());
