// Auto-generated from video-drawable.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, Texture, Video } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const VIDEO_URL = assets.demo.video.demoLoop;
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
class VideoDrawableScene extends Scene {
    video;
    overlay;
    elapsed = 0;
    hud;
    async load(loader) {
        await loader.load(Video, { demo: VIDEO_URL });
        await loader.load(Texture, { ship: assets.demo.textures.shipA });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.video = loader.get(Video, 'demo');
        this.video.width = width;
        this.video.height = height;
        // Muted playback autoplays reliably under browser autoplay policy without
        // requiring a user gesture first.
        this.video.applyOptions({ loop: true, muted: true, volume: 0.5 });
        // A sprite composited on top of the live video texture — the same scene
        // graph draws video frames and regular sprites side by side.
        this.overlay = new Sprite(loader.get(Texture, 'ship'));
        this.overlay.setAnchor(0.5);
        this.overlay.setScale(3);
        this.overlay.setPosition(width / 2, height / 2);
        this.hud = mountControls({
            title: 'Video Drawable',
            controls: [{ keys: 'Tap', action: 'play / pause' }],
            status: 'Playing',
            hint: 'The video streams as a live GPU texture with a sprite composited over it.',
        });
        this.app.input.onPointerTap.add(() => {
            this.video.toggle();
            this.hud.setStatus(this.video.playing ? 'Playing' : 'Paused');
        });
        this.video.play();
    }
    update(delta) {
        this.elapsed += delta.seconds;
        const { width, height } = this.app.canvas;
        // Drift the composited sprite across the video so the overlay is obvious.
        this.overlay.setPosition(width / 2 + Math.sin(this.elapsed) * (width * 0.3), height / 2 + Math.cos(this.elapsed * 0.7) * (height * 0.25));
        this.overlay.rotate(delta.seconds * 60);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.video);
        context.render(this.overlay);
    }
}
app.start(new VideoDrawableScene());
