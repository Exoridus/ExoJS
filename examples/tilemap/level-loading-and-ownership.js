// Auto-generated from level-loading-and-ownership.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
import { MapLevelSide, MapWorld, MapWorldRuntime } from '@codexo/exojs/tilemap';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { demoPanel } from '@examples/runtime';
const ROOM_SIZE = { x: 0, y: 0, width: 1280, height: 768 };
const world = new MapWorld({
  name: 'Two Rooms',
  levels: [
    {
      id: 'harbor',
      name: 'Harbor',
      index: 0,
      bounds: ROOM_SIZE,
      external: true,
      neighbours: [{ id: 'workshop', side: MapLevelSide.East }],
      properties: {},
    },
    {
      id: 'workshop',
      name: 'Workshop',
      index: 1,
      bounds: ROOM_SIZE,
      external: true,
      neighbours: [{ id: 'harbor', side: MapLevelSide.West }],
      properties: {},
    },
  ],
});
const roomPath = {
  harbor: assets.harborPlazaMap.source,
  workshop: assets.ownershipWorkshopMap.source,
};
const waitForTransition = signal =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Transition cancelled.', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Transition cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 750);
    signal.addEventListener('abort', onAbort, { once: true });
  });
class LevelOwnershipScene extends Scene {
  runtime;
  node = null;
  activeId = null;
  pending = null;
  roomLabel = new Text('No room loaded', { fillColor: new Color(31, 49, 54), fontSize: 34 });
  panel;
  init() {
    this.roomLabel.position.set(470, 80);
    this.runtime = new MapWorldRuntime({
      world,
      scope: this.loader,
      load: async ({ level, scope, signal }) => {
        await waitForTransition(signal);
        return scope.load(Asset.type('tileMap', roomPath[level.id]));
      },
    });
    this.panel = demoPanel({
      title: 'Rooms',
      controls: {},
      actions: {
        'Enter Harbor': () => {
          void this.enter('harbor');
        },
        'Enter Workshop': () => {
          void this.enter('workshop');
        },
        'Cancel pending': () => this.cancelPending(),
        'Unload room': () => this.unloadActive(),
      },
    });
    void this.enter('harbor');
  }
  async enter(id) {
    this.cancelPending();
    if (id === this.activeId) {
      return;
    }
    // A fresh object per request: a cancelled request for the same level id
    // settles after its replacement started, and must not touch its state.
    const request = { id };
    this.pending = request;
    this.roomLabel.text = `Loading ${world.getLevel(id)?.name}...`;
    this.panel.status(this.describeResidency());
    try {
      const level = await this.runtime.loadLevel(id);
      if (this.pending !== request) {
        return;
      }
      const previousId = this.activeId;
      this.node?.destroy();
      this.node = new TileMapNode(level.map);
      this.node.position.set(96, 34);
      this.node.scale.set(0.85);
      this.activeId = id;
      this.roomLabel.text = `${level.level.name} loaded`;
      if (previousId) {
        this.runtime.unloadLevel(previousId);
      }
      this.panel.status(this.describeResidency());
    } catch (error) {
      if (this.pending === request) {
        this.panel.status(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (this.pending === request) {
        this.pending = null;
      }
    }
  }
  cancelPending() {
    if (!this.pending) {
      return;
    }
    const { id } = this.pending;
    this.pending = null;
    this.runtime.unloadLevel(id);
    this.roomLabel.text = this.activeId ? `${world.getLevel(this.activeId)?.name} loaded` : 'No room loaded';
    this.panel.status(this.describeResidency());
  }
  unloadActive() {
    if (!this.activeId) {
      return;
    }
    const id = this.activeId;
    this.node?.destroy();
    this.node = null;
    this.activeId = null;
    this.runtime.unloadLevel(id);
    this.roomLabel.text = 'No room loaded';
    this.panel.status(this.describeResidency());
  }
  describeResidency() {
    const atlas = this.app.loader.inspect().find(row => row.aliases.some(alias => alias.includes('mapPack_tilesheet')));
    return `${this.runtime.levels.length} live room(s), shared atlas ${atlas?.claims ?? 0} claim(s)`;
  }
  draw(context) {
    if (this.node) {
      context.render(this.node);
    }
    context.render(this.roomLabel);
  }
  destroy() {
    this.cancelPending();
    this.node?.destroy();
    this.runtime?.destroy();
    this.roomLabel.destroy();
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { LevelOwnershipScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(28, 36, 46),
  extensions: [tiledExtension],
});
await app.start(LevelOwnershipScene);
