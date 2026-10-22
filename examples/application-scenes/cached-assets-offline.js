// Auto-generated from cached-assets-offline.ts - edit the .ts source, not this file.
import {
  Application,
  AssetCache,
  AssetCacheMissError,
  Color,
  ConnectivityPolicyResolver,
  FixedResolutionCanvasSizing,
  Graphics,
  IndexedDbStore,
  Scene,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, toggle } from '@examples/runtime';
const cache = new AssetCache({
  stores: new IndexedDbStore('exojs-playground-offline-demo'),
  policy: new ConnectivityPolicyResolver(),
});
const warmAsset = assets.genericInputPromptsAtlas;
const coldAsset = assets.keyboardMouseInputPromptsAtlas;
class CachedAssetsScene extends Scene {
  backdrop = new Graphics();
  title = new Text('Offline Asset Lab', { fillColor: Color.white, fontSize: 44 });
  warmState = new Text('Generic prompts: not warmed', { fillColor: Color.white, fontSize: 25 });
  result = new Text('Warm the cache, then request sources online and offline.', { fillColor: Color.white, fontSize: 25 });
  panel;
  busy = false;
  init() {
    this.backdrop.fillColor = new Color(24, 37, 55);
    this.backdrop.drawRoundedRectangle(150, 130, 980, 450, 24);
    this.backdrop.lineWidth = 2;
    this.backdrop.lineColor = new Color(94, 127, 158);
    this.backdrop.drawRoundedRectangle(150, 130, 980, 450, 24);
    this.title.position.set(215, 195);
    this.warmState.position.set(215, 300);
    this.result.position.set(215, 385);
    this.panel = demoPanel({
      title: 'Cache actions',
      controls: { offline: toggle('Offline policy', false) },
      actions: {
        'Warm generic prompts': () => {
          void this.run('Warm', () => this.app.loader.cacheSource(warmAsset));
        },
        'Request warmed source': () => {
          void this.request(warmAsset, 'Generic prompts');
        },
        'Request unwarmed source': () => {
          void this.request(coldAsset, 'Keyboard prompts');
        },
        'Clear demo cache': () => {
          void this.run('Clear', () => cache.clear());
        },
      },
      onChange: (key, value) => {
        if (key === 'offline') {
          this.app.connectivity.mode = value ? 'offline' : 'online';
        }
      },
    });
  }
  async run(action, task) {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.result.text = `${action} in progress...`;
    try {
      await task();
      this.warmState.text = action === 'Warm' ? 'Generic prompts: warmed in IndexedDB' : 'Generic prompts: cache cleared';
      this.result.text =
        action === 'Warm' ? 'Source stored without making an asset resident.' : 'Cache cleared. Retry while offline to see a miss.';
    } catch (error) {
      this.result.text = `${action} failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.busy = false;
    }
  }
  async request(asset, name) {
    if (this.busy) {
      return;
    }
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
      this.busy = false;
    }
  }
  draw(context) {
    context.render(this.backdrop);
    context.render(this.title);
    context.render(this.warmState);
    context.render(this.result);
  }
  destroy() {
    this.app.connectivity.mode = 'auto';
    this.panel?.dispose();
    this.backdrop.destroy();
    this.title.destroy();
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
  loader: { cache },
});
await app.start(CachedAssetsScene);
