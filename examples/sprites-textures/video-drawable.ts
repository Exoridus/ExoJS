import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  Rectangle,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  type Video,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, slider, startExample, toggle } from '@examples/runtime';

// SDR clips only. Browser external video textures do not establish an HDR pipeline.
const VIDEOS = [
  { label: 'Demo loop (WebM)', asset: assets.videoDemoLoop },
  { label: '4K 24 fps (MP4)', asset: assets.videoHighRes },
  { label: '1080p 60 fps (WebM)', asset: assets.videoHighFps },
];
const controls = {
  clip: choice(
    'Clip',
    VIDEOS.map(entry => entry.label),
  ),
  seek: slider('Seek %', { min: 0, max: 100, step: 1, value: 0 }),
  paused: toggle('Paused', true),
  loop: toggle('Loop', true),
};
class VideoDrawableScene extends Scene {
  private video: Video | null = null;
  private overlay!: Sprite;
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private readonly loaded = new Set<Video>();
  private generation = 0;
  private videoIdx = -1;
  private elapsed = 0;
  private mediaState = 'Waiting for media';
  private loading = false;

  override init(): void {
    this.overlay = new Sprite(this.loader.get(assets.platformerTilesImage)).setTextureFrame(new Rectangle(650, 325, 64, 64)).setAnchor(0.5);
    this.panel = demoPanel({
      title: 'Play a Video Texture',
      layout: 'bar',
      controls,
      hint: 'Muted SDR video. Play explicitly; clip changes preserve pause, seek and loop.',
      actions: {
        'Play / Pause': () => this.panel.step('paused'),
        Reset: () => {
          this.elapsed = 0;
          this.panel.set('paused', true);
          this.panel.set('seek', 0);
        },
      },
      onChange: (key, _value, values) => {
        if (key === 'clip') {
          void this.switchVideo(VIDEOS.findIndex(entry => entry.label === values.clip));

          return;
        }

        if (this.loading || !this.video) {
          return;
        }

        if (key === 'seek') {
          this.video.currentTime = (this.video.duration * values.seek) / 100;
        }

        if (key === 'paused') {
          if (values.paused) {
            this.video.pause();
          } else {
            this.play();
          }
        }

        if (key === 'loop') {
          this.video.loop = values.loop;
        }
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.panel.step('paused'));
    this.inputs.onTrigger(Keyboard.R, () => {
      this.elapsed = 0;
      this.panel.set('paused', true);
      this.panel.set('seek', 0);
    });
    this.inputs.onTrigger(Keyboard.One, () => this.panel.set('clip', VIDEOS[0].label));
    this.inputs.onTrigger(Keyboard.Two, () => this.panel.set('clip', VIDEOS[1].label));
    this.inputs.onTrigger(Keyboard.Three, () => this.panel.set('clip', VIDEOS[2].label));
    this.app.input.onPointerTap.add(this.onTap);
  }

  private readonly onTap = (): void => this.panel.step('paused');
  private readonly onError = (error: Error): void => {
    this.mediaState = `Error: ${error.message}`;
    this.panel.status(`Media error: ${error.message}`, 'error');
  };
  private readonly onEnded = (): void => {
    this.mediaState = 'Ended';
    this.panel.set('paused', true);
  };

  private play(): void {
    const video = this.video;

    if (!video) {
      return;
    }

    void video.videoElement
      .play()
      .then(() => {
        if (!this.lifecycleSignal.aborted && video === this.video) {
          this.mediaState = 'Playing';
        }
      })
      .catch((error: unknown) => {
        if (!this.lifecycleSignal.aborted && video === this.video) {
          this.onError(error instanceof Error ? error : new Error(String(error)));
        }
      });
  }

  private async switchVideo(index: number): Promise<void> {
    if (index < 0) {
      return;
    }

    if (index === this.videoIdx) {
      if (this.loading) {
        // Returning to the shown clip abandons the request still in flight.
        this.generation++;
        this.loading = false;
        this.mediaState = 'Ready';

        if (!this.panel.values.paused) {
          this.play();
        }
      }

      return;
    }

    const request = ++this.generation;
    this.loading = true;
    this.mediaState = 'Loading';
    this.video?.pause();

    try {
      const loaded = await this.loader.load(VIDEOS[index].asset);
      this.loaded.add(loaded);

      if (loaded !== this.video) {
        loaded.pause();
      }

      loaded.muted = true;

      if (this.lifecycleSignal.aborted || request !== this.generation) {
        return;
      }

      this.detach();
      this.video = loaded;
      this.videoIdx = index;
      loaded.applyOptions({ muted: true, loop: this.panel.values.loop, volume: 0, time: (loaded.duration * this.panel.values.seek) / 100 });
      loaded.onError.add(this.onError);
      loaded.videoElement.addEventListener('ended', this.onEnded);
      this.mediaState = 'Ready';

      if (!this.panel.values.paused) {
        this.play();
      }
    } catch (error: unknown) {
      if (!this.lifecycleSignal.aborted && request === this.generation) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      if (request === this.generation) {
        this.loading = false;
      }
    }
  }

  private detach(): void {
    if (!this.video) {
      return;
    }

    this.video.pause();
    this.video.muted = true;
    this.video.onError.remove(this.onError);
    this.video.videoElement.removeEventListener('ended', this.onEnded);
  }

  override update(delta: Seconds): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);

    if (!this.panel.values.paused && !this.loading) {
      this.elapsed += delta;
    }

    if (this.video) {
      this.video.setPosition(0, 0);
      this.video.width = this.app.width;
      this.video.height = contentHeight * scale;
    }

    this.overlay
      .setPosition(
        (width / 2 + Math.sin(this.elapsed) * width * 0.25) * scale,
        (contentHeight / 2 + Math.cos(this.elapsed * 0.7) * contentHeight * 0.2) * scale,
      )
      .setScale(scale * 0.8);
    const time = this.video?.currentTime ?? 0;
    const duration = this.video?.duration ?? 0;
    this.panel.status(
      `${this.mediaState} | ${this.loading ? 'loading' : this.video?.videoElement.ended ? 'ended' : this.video ? (this.video.paused ? 'paused' : 'playing') : 'no video'} | ${time.toFixed(1)} / ${duration.toFixed(1)}s | muted | SDR`,
      this.mediaState.startsWith('Loading')
        ? 'info'
        : this.mediaState.startsWith('Error:')
          ? 'error'
          : this.mediaState === 'Ready'
            ? 'success'
            : 'neutral',
    );
  }

  override draw(context: RenderingContext): void {
    if (this.video) {
      context.render(this.video);
    }

    context.render(this.overlay);
  }

  override destroy(): void {
    this.generation++;
    this.detach();

    for (const video of this.loaded) {
      video.pause();
      video.muted = true;
    }

    this.app.input.onPointerTap.remove(this.onTap);
    this.overlay.destroy();
    this.panel.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { VideoDrawableScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await startExample(app, () => app.start(VideoDrawableScene));
