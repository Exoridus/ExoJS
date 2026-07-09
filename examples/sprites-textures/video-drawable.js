// Auto-generated from video-drawable.ts — edit the .ts source, not this file.
import { Asset } from '@codexo/exojs';
import { Application, Color, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
// Every video in the asset catalog, switchable at runtime with the number
// keys. Only the first entry is fetched up front — the others lazy-load on
// first selection so startup stays fast.
const VIDEOS = [
    { name: 'demoLoop', label: 'Demo loop (webm)', url: assets.demo.video.demoLoop },
    { name: 'highRes', label: 'High-res (mp4)', url: assets.demo.video.highRes },
    { name: 'highFps', label: 'High-fps (webm)', url: assets.demo.video.highFps },
    { name: 'hdr10', label: 'HDR10 (webm)', url: assets.demo.video.hdr10 },
];
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
    assetLoader = null;
    videoIdx = 0;
    loadedVideos = new Map();
    switching = false;
    async load(loader) {
        this.assetLoader = loader;
        const first = await loader.load(Asset.kind('video', VIDEOS[0].url));
        this.loadedVideos.set(VIDEOS[0].name, first);
        await loader.load(assets.demo.textures.shipA);
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.video = this.loadedVideos.get(VIDEOS[0].name);
        this.configureVideo();
        // A sprite composited on top of the live video texture — the same scene
        // graph draws video frames and regular sprites side by side.
        this.overlay = new Sprite(loader.get(assets.demo.textures.shipA));
        this.overlay.setAnchor(0.5);
        this.overlay.setScale(3);
        this.overlay.setPosition(width / 2, height / 2);
        this.hud = mountControls({
            title: 'Video Drawable',
            controls: [
                { keys: 'Tap', action: 'play / pause' },
                { keys: '1–4', action: 'switch video' },
            ],
            status: `Playing — ${VIDEOS[0].label}`,
            hint: 'The video streams as a live GPU texture with a sprite composited over it.',
        });
        this.app.input.onPointerTap.add(() => {
            this.video.toggle();
            this.hud.setStatus(this.video.playing ? `Playing — ${VIDEOS[this.videoIdx].label}` : 'Paused');
        });
        this.app.input.onKeyDown.add(channel => {
            const idx = [Keyboard.One, Keyboard.Two, Keyboard.Three, Keyboard.Four].indexOf(channel);
            if (idx !== -1)
                void this.switchVideo(idx);
        });
        this.video.play();
    }
    /** Sizing + playback options shared by every video the example swaps in. */
    configureVideo() {
        const { width, height } = this.app.canvas;
        this.video.width = width;
        this.video.height = height;
        // Muted playback autoplays reliably under browser autoplay policy without
        // requiring a user gesture first.
        this.video.applyOptions({ loop: true, muted: true, volume: 0.5 });
    }
    async switchVideo(idx) {
        if (idx === this.videoIdx || this.switching)
            return;
        const entry = VIDEOS[idx];
        this.switching = true;
        this.hud.setStatus(`Loading — ${entry.label}…`);
        try {
            let video = this.loadedVideos.get(entry.name);
            if (!video) {
                video = await this.assetLoader.load(Asset.kind('video', entry.url));
                this.loadedVideos.set(entry.name, video);
            }
            this.video.pause();
            this.videoIdx = idx;
            this.video = video;
            this.configureVideo();
            this.video.play();
            this.hud.setStatus(`Playing — ${entry.label}`);
        }
        catch {
            this.hud.setStatus(`Failed to load — ${entry.label}`);
        }
        finally {
            this.switching = false;
        }
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
