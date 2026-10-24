import { Application, Asset, Color, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel } from '@examples/runtime';

const descriptors = [assets.uvGrid256, assets.hueRamp, assets.pixelWhite];
const names = ['Scene queue: UV grid', 'Scene queue: colour ramp', 'UI queue: white pixel'];
type LoadState = 'waiting' | 'loading' | 'loaded' | 'failed';

class BootScene extends Scene {
  private readonly bar = this.track(new Graphics());
  private readonly labels = names.map(() => this.track(new Text('', { fillColor: Color.white })));
  private states: LoadState[] = ['waiting', 'waiting', 'waiting'];
  private attempts = [0, 0, 0];
  private loading = false;
  private panel!: ReturnType<typeof demoPanel>;

  // #region guide:boot-signals
  override init(): void {
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Loading Progress and Retry',
      controls: {},
      hint: 'Two queues share one loader. Retry requests only the failed asset.',
      actions: {
        Load: () => void this.loadAssets(false),
        'Load with one broken file': () => void this.loadAssets(true),
        'Retry failed': () => void this.retry(),
      },
    });
    this.panel.status('Ready - choose Load or the deliberate failure.');
  }
  // #endregion guide:boot-signals

  private async loadOne(index: number, broken = false): Promise<void> {
    this.states[index] = 'loading';
    this.attempts[index]!++;
    const descriptor = broken ? Asset.type('texture', `${assets.pixelWhite.source}.missing.png`) : descriptors[index]!;

    try {
      await this.loader.load(descriptor);
      this.states[index] = 'loaded';
    } catch {
      this.states[index] = 'failed';
    }
  }

  private async loadAssets(broken: boolean): Promise<void> {
    if (this.loading) {
      return;
    }

    descriptors.forEach(descriptor => this.loader.release(descriptor));
    this.loading = true;
    this.states.fill('waiting');
    this.attempts.fill(0);
    this.panel.status('Loading two queues...', 'info');
    const sceneQueue = Promise.all([this.loadOne(0), this.loadOne(1)]);
    const uiQueue = this.loadOne(2, broken);
    await Promise.all([sceneQueue, uiQueue]);
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
      label.setPosition(left, top + (26 + index * 48) * k);
      context.render(label);
    });
  }
}
const app = new Application({
  scenes: { BootScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await app.start(BootScene);
