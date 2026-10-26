import {
  Application,
  Asset,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  Sprite,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle } from '@examples/runtime';

const descriptors = [assets.platformerTilesImage, assets.backgroundForest, assets.spaceShipBlue];
const names = ['Platform tiles', 'Forest background', 'Spaceship'];
const controls = { slow: toggle('Slow queue (simulation)', true) };
type LoadState = 'waiting' | 'loading' | 'loaded' | 'failed';

class BootScene extends Scene {
  private readonly bar = this.track(new Graphics());
  private readonly labels = names.map(() => this.track(new Text('', { fillColor: Color.white })));
  private readonly previews: Array<Sprite | null> = descriptors.map(() => null);
  private states: LoadState[] = ['waiting', 'waiting', 'waiting'];
  private attempts = [0, 0, 0];
  private loading = false;
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;

  // The application loader reports every request, whichever scene or scope issued it.
  private readonly onLoadProgress = (loaded: number, total: number, key: string): void => {
    this.panel.status(`Loading ${loaded} / ${total} - ${key}`, 'info');
  };

  private readonly onLoadError = (key: string): void => {
    this.panel.status(`${key} failed to load.`, 'error');
  };

  // #region guide:boot-signals
  override init(): void {
    this.app.loader.onLoadProgress.add(this.onLoadProgress);
    this.app.loader.onLoadError.add(this.onLoadError);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: {
        Load: () => void this.loadAssets(false),
        'Load with one broken file': () => void this.loadAssets(true),
        'Retry failed': () => void this.retry(),
      },
    });
    this.panel.status('Load real images, or deliberately break the last URL to try Retry.');
  }
  // #endregion guide:boot-signals

  private async loadOne(index: number, broken = false): Promise<void> {
    this.states[index] = 'loading';
    this.attempts[index]!++;
    const descriptor = broken ? Asset.type('texture', `${descriptors[index]!.source}.missing.png`) : descriptors[index]!;

    try {
      const texture = await this.loader.load(descriptor);

      if (this.lifecycleSignal.aborted) {
        return;
      }

      this.previews[index]?.destroy();
      this.previews[index] = new Sprite(texture).setAnchor(0.5);
      this.states[index] = 'loaded';
    } catch {
      this.states[index] = 'failed';
    }
  }

  private async loadAssets(broken: boolean): Promise<void> {
    if (this.loading) {
      return;
    }

    this.previews.forEach(sprite => sprite?.destroy());
    this.previews.fill(null);
    descriptors.forEach(descriptor => this.loader.release(descriptor));
    this.loading = true;
    this.states.fill('waiting');
    this.attempts.fill(0);
    this.panel.status(this.panel.values.slow ? 'Simulation: start one real file every 400 ms.' : 'Loading real files...', 'info');

    for (let index = 0; index < descriptors.length; index++) {
      if (index > 0 && this.panel.values.slow) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }

      if (this.lifecycleSignal.aborted) {
        return;
      }

      await this.loadOne(index, broken && index === descriptors.length - 1);
    }

    this.finish();
  }

  private async retry(): Promise<void> {
    if (this.loading || !this.states.includes('failed')) {
      return;
    }

    this.loading = true;
    await Promise.all(this.states.map((state, index) => (state === 'failed' ? this.loadOne(index) : undefined)));
    this.finish();
  }

  private finish(): void {
    if (this.lifecycleSignal.aborted) {
      return;
    }

    this.loading = false;
    const failed = this.states.filter(state => state === 'failed').length;
    this.panel.status(
      failed ? `${failed} failed - Retry failed repairs the URL.` : 'All three loaded. Load again to compare a fresh queue.',
      failed ? 'error' : 'success',
    );
  }

  // #region guide:boot-unsubscribe
  override destroy(): void {
    this.app.loader.onLoadProgress.remove(this.onLoadProgress);
    this.app.loader.onLoadError.remove(this.onLoadError);
    this.previews.forEach(sprite => sprite?.destroy());
    this.panel?.dispose();
    super.destroy();
  }
  // #endregion guide:boot-unsubscribe

  override draw(context: RenderingContext): void {
    const { scale: k, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const left = 24 * k;
    const top = Math.max(18, (contentHeight - 172) / 2) * k;
    const loaded = this.states.filter(state => state === 'loaded').length;
    this.bar.clear();
    this.bar.fillColor = new Color(25, 31, 36);
    this.bar.drawRectangle(left, top, (width - 48) * k, 12 * k);
    this.bar.fillColor = new Color(136, 233, 126);
    this.bar.drawRectangle(left, top, ((width - 48) * k * loaded) / 3, 12 * k);
    context.render(this.bar);
    this.labels.forEach((label, index) => {
      label.style.fontSize = 15 * k;
      label.style.fillColor = this.states[index] === 'failed' ? new Color(255, 124, 128) : Color.white;
      label.text = `${names[index]}\n${this.states[index]} | requests: ${this.attempts[index]}`;
      const y = top + (26 + index * 48) * k;
      label.setPosition(left, y);
      const sprite = this.previews[index];

      if (sprite?.texture) {
        sprite.setScale(Math.min((80 * k) / sprite.texture.width, (40 * k) / sprite.texture.height));
        sprite.setPosition((width - 80) * k, y + 16 * k);
        context.render(sprite);
      }

      context.render(label);
    });
  }
}
const app = new Application({
  scenes: { BootScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(BootScene));
