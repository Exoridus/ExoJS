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
    private video!: Video;

    override async load(loader): Promise<void> {
        await loader.load(Video, { demo: VIDEO_URL });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.video = loader.get(Video, 'demo');
        this.video.width = width;
        this.video.height = height;
        this.video.applyOptions({ loop: true, muted: false, volume: 0.5 });

        this.app.input.onPointerTap.add(() => { this.video.toggle(); });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.video);
    }
}

app.start(new VideoDrawableScene());
