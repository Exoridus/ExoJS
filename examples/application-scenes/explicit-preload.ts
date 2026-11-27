import { Application, Color, FixedResolutionCanvasSizing, Graphics, type LoadingQueue, Scene, Sprite, Text, Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample } from '@examples/runtime';

const sources = [
  assets.spaceShipBlue.source,
  assets.spaceEnemyRed.source,
  assets.spaceBossRed.source,
  assets.spaceMeteorBrown.source,
  assets.spaceMeteorGrey.source,
  assets.spaceLaserBlue.source,
];

class PreloadScene extends Scene {
  private readonly bar = this.track(new Graphics());
  private readonly label = this.track(new Text('Nothing loaded yet.', { fillColor: Color.white, fontSize: 24 }));
  private panel!: ReturnType<typeof demoPanel<Record<string, never>>>;
  private queue: LoadingQueue<Texture[]> | null = null;
  private readonly previews: Sprite[] = [];
  private fraction = 0;

  override init(): void {
    this.label.setPosition(160, 300);
    this.root.addChild(this.bar, this.label);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
      actions: {
        'Preload six sprites': () => void this.preload(),
        Cancel: () => this.queue?.cancel(),
      },
    });
    this.panel.status('The scene owns what it preloads and releases it when the scene ends.');
  }

  // #region guide:explicit-preload
  private async preload(): Promise<void> {
    if (this.queue !== null) {
      return;
    }

    this.previews.forEach(sprite => sprite.destroy());
    this.previews.length = 0;

    // Each handle is a plain Texture that names its file. The scene loader claims all of them
    // for this scene, loads them in parallel and resolves to the same shape.
    const queue = this.assets.load(sources.map(source => new Texture(source)));

    this.queue = queue;
    queue.onProgress.add(({ loaded, total }) => {
      if (this.lifecycleSignal.aborted) {
        return;
      }

      this.fraction = total === 0 ? 0 : loaded / total;
      this.label.text = `Loaded ${loaded} of ${total}`;
    });

    try {
      const textures = await queue;

      if (this.lifecycleSignal.aborted) {
        return;
      }

      textures.forEach((texture, index) => {
        // The texture is ready, so its real size is known before the first frame.
        const sprite = new Sprite(texture).setAnchor(0.5).setPosition(220 + index * 168, 470);

        this.previews.push(sprite);
        this.root.addChild(sprite);
      });
      this.label.text = `Ready: ${textures.map(texture => `${texture.width}px`).join(', ')}`;
      this.panel.status('All six are resident. Preloading again reuses them without a second request.', 'success');
    } catch (error) {
      if (this.lifecycleSignal.aborted) {
        return;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.label.text = 'Cancelled';
        this.panel.status('Cancelled: this pending load withdrew its claims; other owners keep theirs.', 'warning');
      } else {
        this.label.text = 'Loading failed. Try again.';
        this.panel.status('A fetch or decode failed. See the Output panel for the error, then retry.', 'warning');
        console.error('Sprite preload failed', error);
      }
    } finally {
      this.queue = null;
    }
  }
  // #endregion guide:explicit-preload

  override update(): void {
    this.bar.clear();
    this.bar.fillColor = new Color(25, 31, 36);
    this.bar.drawRectangle(160, 350, 960, 14);
    this.bar.fillColor = new Color(136, 233, 126);
    this.bar.drawRectangle(160, 350, 960 * this.fraction, 14);
  }

  override destroy(): void {
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { PreloadScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});

await startExample(app, () => app.start(PreloadScene));
