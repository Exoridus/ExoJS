// Auto-generated from video-drawable.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, toggle } from '@examples/runtime';
// Every video in the asset catalog, switchable at runtime with the number
// keys. Only the first entry is fetched up front - the others lazy-load on
// first selection so startup stays fast.
//
// The list is SDR video only. A video frame is imported as an external texture
// in the browser's own display encoding and sampled as sRGB colour; the engine
// makes no HDR-video promise, so no HDR clip is offered.
const VIDEOS = [
  { name: 'demoLoop', label: 'Demo loop (webm)', asset: assets.videoDemoLoop },
  { name: 'highRes', label: '4K, 24 fps (mp4)', asset: assets.videoHighRes },
  { name: 'highFps', label: '1080p, 60 fps (webm)', asset: assets.videoHighFps },
];
class VideoDrawableScene extends Scene {
  onPointerTap = () => {
    this.panel.step('paused');
  };
  onKeyDown = channel => {
    const idx = [Keyboard.One, Keyboard.Two, Keyboard.Three].indexOf(channel);
    if (idx !== -1) {
      this.panel.set('video', VIDEOS[idx].label);
    }
  };
  video;
  overlay;
  elapsed = 0;
  panel;
  videoIdx = 0;
  loadedVideos = new Set();
  switching = false;
  async load() {
    const app = this.app;
    const { width, height } = app;
    // Video has no placeholder handle (unlike Texture and Sound), so it is
    // awaited with `load()` rather than claimed synchronously with `get()`.
    this.video = await this.loader.load(VIDEOS[0].asset);
    this.loadedVideos.add(VIDEOS[0].name);
    this.configureVideo();
    // A sprite composited on top of the live video texture - the same scene
    // graph draws video frames and regular sprites side by side. Texture IS
    // seamless, so it is fetched directly by source with no preload step.
    this.overlay = new Sprite(this.loader.get(assets.ship));
    this.overlay.setAnchor(0.5);
    this.overlay.setScale(3);
    this.overlay.setPosition(width / 2, height / 2);
    this.video.play();
    // Clicks and the number keys move the same panel state.
    this.panel = demoPanel({
      title: 'Video',
      controls: {
        video: choice(
          'Clip',
          VIDEOS.map(entry => entry.label),
        ),
        paused: toggle('Paused'),
      },
      onChange: (key, _value, values) => {
        if (key === 'paused') {
          if (values.paused) {
            this.video.pause();
          } else {
            this.video.play();
          }
        } else {
          void this.switchVideo(VIDEOS.findIndex(entry => entry.label === values.video));
        }
      },
    });
    this.app.input.onPointerTap.add(this.onPointerTap);
    this.app.input.onKeyDown.add(this.onKeyDown);
  }
  /** Sizing + playback options shared by every video the example swaps in. */
  configureVideo() {
    const app = this.app;
    const { width, height } = app;
    this.video.width = width;
    this.video.height = height;
    // Muted playback autoplays reliably under browser autoplay policy without
    // requiring a user gesture first.
    this.video.applyOptions({ loop: true, muted: true, volume: 0.5 });
  }
  async switchVideo(idx) {
    if (idx === this.videoIdx || this.switching) {
      return;
    }
    const entry = VIDEOS[idx];
    this.switching = true;
    this.panel.status(`Loading ${entry.label}...`);
    try {
      const loaded = await this.loader.load(entry.asset);
      if (this.lifecycleSignal.aborted) {
        return;
      }
      this.loadedVideos.add(entry.name);
      this.video.pause();
      this.videoIdx = idx;
      this.video = loaded;
      this.configureVideo();
      this.panel.set('paused', false);
      this.video.play();
      this.panel.status('');
    } catch {
      if (this.lifecycleSignal.aborted) {
        return;
      }
      this.panel.status(`Failed to load ${entry.label}.`);
      this.panel.set('video', VIDEOS[this.videoIdx].label);
    } finally {
      this.switching = false;
    }
    // A choice made while this one was loading is honoured once it is done.
    const wanted = VIDEOS.findIndex(candidate => candidate.label === this.panel.values.video);
    if (wanted !== this.videoIdx) {
      void this.switchVideo(wanted);
    }
  }
  update(delta) {
    const app = this.app;
    this.elapsed += delta;
    const { width, height } = app;
    // Drift the composited sprite across the video so the overlay is obvious.
    this.overlay.setPosition(
      width / 2 + Math.sin(this.elapsed) * (width * 0.3),
      height / 2 + Math.cos(this.elapsed * 0.7) * (height * 0.25),
    );
    this.overlay.rotate(delta * 60);
  }
  draw(context) {
    context.render(this.video);
    context.render(this.overlay);
  }
  destroy() {
    this.app.input.onPointerTap.remove(this.onPointerTap);
    this.app.input.onKeyDown.remove(this.onKeyDown);
    this.overlay?.destroy();
    this.panel?.dispose();
    this.video?.pause();
    super.destroy();
  }
}
const app = new Application({
  scenes: { VideoDrawableScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(VideoDrawableScene);
