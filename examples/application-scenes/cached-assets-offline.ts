import {
  Application,
  Asset,
  AssetCache,
  AssetCacheMissError,
  Color,
  ConnectivityPolicyResolver,
  FixedResolutionCanvasSizing,
  Graphics,
  IndexedDbStore,
  type RenderingContext,
  Scene,
  Text,
} from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const cache = new AssetCache({
  stores: new IndexedDbStore('exojs-playground-offline-demo'),
  policy: new ConnectivityPolicyResolver(),
});

const warmAsset = Asset.type('json', assets.demo.inputPrompts.generic.data);
const coldAsset = Asset.type('json', assets.demo.inputPrompts.keyboardMouse.data);

class CachedAssetsScene extends Scene {
  private readonly backdrop = new Graphics();
  private readonly title = new Text('Offline Asset Lab', { fillColor: Color.white, fontSize: 44 });
  private readonly mode = new Text('Network allowed', { fillColor: new Color(106, 229, 171), fontSize: 28 });
  private readonly warmState = new Text('Generic prompts: not warmed', { fillColor: Color.white, fontSize: 25 });
  private readonly result = new Text('Choose an action in the panel.', { fillColor: Color.white, fontSize: 25 });
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof mountControlPanel>;
  private busy = false;

  override init(): void {
    this.backdrop.fillColor = new Color(24, 37, 55);
    this.backdrop.drawRoundedRectangle(150, 130, 980, 450, 24);
    this.backdrop.lineWidth = 2;
    this.backdrop.lineColor = new Color(94, 127, 158);
    this.backdrop.drawRoundedRectangle(150, 130, 980, 450, 24);
    this.title.position.set(215, 195);
    this.mode.position.set(215, 285);
    this.warmState.position.set(215, 380);
    this.result.position.set(215, 465);

    this.hud = mountControls({
      title: 'Cached Assets Offline',
      controls: [{ keys: 'Panel', action: 'warm, request, clear, and change network policy' }],
      status: 'Online policy. Warm the first JSON source, then switch offline.',
      hint: 'Offline mode changes loader policy; it does not disable your browser connection.',
    });
    this.panel = mountControlPanel({ title: 'Cache actions' });
    this.panel.addButton({
      label: 'Warm generic prompts',
      onClick: () => {
        void this.run('Warm', () => this.app.loader.cacheSource(warmAsset));
      },
    });
    this.panel.addToggle({
      label: 'Offline policy',
      value: false,
      onChange: offline => {
        this.app.connectivity.mode = offline ? 'offline' : 'online';
        this.mode.text = offline ? 'Cache only: network forbidden' : 'Network allowed';
        this.mode.style.fillColor = offline ? new Color(255, 186, 95) : new Color(106, 229, 171);
        this.hud.setStatus(offline ? 'Offline policy: requests must be in the cache.' : 'Online policy: requests may use the network.');
      },
    });
    this.panel.addButton({
      label: 'Request warmed source',
      onClick: () => {
        void this.request(warmAsset, 'Generic prompts');
      },
    });
    this.panel.addButton({
      label: 'Request unwarmed source',
      onClick: () => {
        void this.request(coldAsset, 'Keyboard prompts');
      },
    });
    this.panel.addButton({
      label: 'Clear demo cache',
      onClick: () => {
        void this.run('Clear', () => cache.clear());
      },
    });
  }

  private async run(action: 'Warm' | 'Clear', task: () => Promise<unknown>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.result.text = `${action} in progress...`;
    try {
      await task();
      this.warmState.text = action === 'Warm' ? 'Generic prompts: warmed in IndexedDB' : 'Generic prompts: cache cleared';
      this.result.text = action === 'Warm' ? 'Source stored without making an asset resident.' : 'Cache cleared. Retry while offline to see a miss.';
    } catch (error) {
      this.result.text = `${action} failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.hud.setStatus(this.result.text);
      this.busy = false;
    }
  }

  private async request(asset: typeof warmAsset, name: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.result.text = `Loading ${name}...`;
    const scope = this.loader.createScope({ name: `request:${name}` });
    try {
      await scope.load(asset);
      this.result.text = `${name}: loaded under ${this.app.connectivity.mode} policy.`;
    } catch (error) {
      this.result.text =
        error instanceof AssetCacheMissError
          ? `${name}: cache miss, no network request.`
          : `${name}: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      scope.destroy();
      this.hud.setStatus(this.result.text);
      this.busy = false;
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.backdrop);
    context.render(this.title);
    context.render(this.mode);
    context.render(this.warmState);
    context.render(this.result);
  }

  override destroy(): void {
    this.app.connectivity.mode = 'auto';
    this.hud?.dispose();
    this.panel?.dispose();
    this.backdrop.destroy();
    this.title.destroy();
    this.mode.destroy();
    this.warmState.destroy();
    this.result.destroy();
    cache.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { CachedAssetsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(12, 20, 32),
  loader: { basePath: 'assets/', cache },
});

await app.start(CachedAssetsScene);
