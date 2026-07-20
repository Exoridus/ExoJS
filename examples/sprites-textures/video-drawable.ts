import { Application, Asset, Color, Keyboard, type RenderingContext, Scene, Sprite, Texture, type Time, Video } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

// Every video in the asset catalog, switchable at runtime with the number
// keys. Only the first entry is fetched up front — the others lazy-load on
// first selection so startup stays fast.
const VIDEOS = [
    { name: 'demoLoop', label: 'Demo loop (webm)', url: assets.demo.video.demoLoop },
    { name: 'highRes',  label: 'High-res (mp4)',   url: assets.demo.video.highRes },
    { name: 'highFps',  label: 'High-fps (webm)',  url: assets.demo.video.highFps },
    { name: 'hdr10',    label: 'HDR10 (webm)',     url: assets.demo.video.hdr10 },
];



class VideoDrawableScene extends Scene {
    private video!: Video;
    private overlay!: Sprite;
    private elapsed = 0;
    private hud!: ReturnType<typeof mountControls>;
    private videoIdx = 0;
    private readonly loadedVideos = new Set<string>();
    private switching = false;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        // Video is a non-leaf resource kind (no seamless placeholder, unlike
        // Texture/Sound), so it is loaded directly through `Asset.kind('video', ...)`
        // and awaited rather than fetched synchronously via `get()`.
        this.video = await this.loader.load(Asset.kind('video', VIDEOS[0].url));
        this.loadedVideos.add(VIDEOS[0].name);

        this.configureVideo();

        // A sprite composited on top of the live video texture — the same scene
        // graph draws video frames and regular sprites side by side. Texture IS
        // seamless, so it is fetched directly by source with no preload step.
        this.overlay = new Sprite(this.loader.get(assets.demo.textures.shipA));
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

        app.input.onPointerTap.add(() => {
            this.video.toggle();
            this.hud.setStatus(this.video.playing ? `Playing — ${VIDEOS[this.videoIdx].label}` : 'Paused');
        });

        app.input.onKeyDown.add(channel => {
            const idx = [Keyboard.One, Keyboard.Two, Keyboard.Three, Keyboard.Four].indexOf(channel);
            if (idx !== -1) void this.switchVideo(idx);
        });

        this.video.play();
    }

    /** Sizing + playback options shared by every video the example swaps in. */
    private configureVideo(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.video.width = width;
        this.video.height = height;
        // Muted playback autoplays reliably under browser autoplay policy without
        // requiring a user gesture first.
        this.video.applyOptions({ loop: true, muted: true, volume: 0.5 });
    }

    private async switchVideo(idx: number): Promise<void> {
        if (idx === this.videoIdx || this.switching) return;
        const entry = VIDEOS[idx];
        this.switching = true;
        this.hud.setStatus(`Loading — ${entry.label}…`);
        try {
            const loaded = await this.loader.load(Asset.kind('video', entry.url));
            this.loadedVideos.add(entry.name);
            this.video.pause();
            this.videoIdx = idx;
            this.video = loaded;
            this.configureVideo();
            this.video.play();
            this.hud.setStatus(`Playing — ${entry.label}`);
        } catch {
            this.hud.setStatus(`Failed to load — ${entry.label}`);
        } finally {
            this.switching = false;
        }
    }

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        this.elapsed += delta.seconds;

        const { width, height } = app.canvas;

        // Drift the composited sprite across the video so the overlay is obvious.
        this.overlay.setPosition(width / 2 + Math.sin(this.elapsed) * (width * 0.3), height / 2 + Math.cos(this.elapsed * 0.7) * (height * 0.25));
        this.overlay.rotate(delta.seconds * 60);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.video);
        context.render(this.overlay);
    }
}

const app = new Application({
    scenes: { VideoDrawableScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

app.start(VideoDrawableScene);
