// Auto-generated from level-loading-and-ownership.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
import { MapLevelSide, MapWorld, MapWorldRuntime } from '@codexo/exojs/tilemap';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { demoPanel, startExample } from '@examples/runtime';
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
  roomLabel = new Text('No room loaded', { fillColor: new Color(236, 239, 242), fontSize: 34 });
  ownership = new Text('', { fillColor: new Color(236, 239, 242) });
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
      scene: this,
      layout: 'bar',
      title: 'Room Loading and Asset Ownership',
      hint: 'Optional advanced: map and atlas claims. A 0.75 s transition delay makes Cancel observable.',
      controls: {},
      actions: {
        'Go to other room': () => {
          void this.enter(this.activeId === 'harbor' ? 'workshop' : 'harbor');
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
    const rows = this.app.loader.inspect();
    const atlas = rows.find(row => row.aliases.some(alias => alias.includes('mapPack_tilesheet')));
    this.ownership.text = `Shared atlas: ${atlas?.claims ?? 0} claim(s)\n${Object.entries(roomPath)
      .map(([id, path]) => {
        const room = rows.find(row => row.aliases.some(alias => alias.includes(path)));
        return `${world.getLevel(id)?.name} map: ${room?.claims ?? 0} claim(s)`;
      })
      .join('\n')}`;
    return `${this.runtime.levels.length} live room(s), shared atlas ${atlas?.claims ?? 0} claim(s)`;
  }
  draw(context) {
    if (this.node) {
      context.render(this.node);
    }
    const { scale: k, width, contentHeight, compact } = this.panel.fit(this.app, this.app.canvas);
    this.roomLabel.style.fontSize = 18 * k;
    this.roomLabel.setPosition(16 * k, 12 * k);
    this.ownership.style.fontSize = 14 * k;
    this.ownership.setPosition((compact ? 16 : width * 0.64) * k, (compact ? contentHeight - 76 : 70) * k);
    if (this.node) {
      this.node.setPosition(0, 42 * k);
      this.node.setScale(Math.min((compact ? width : width * 0.61) / 1280, Math.max(30, contentHeight - (compact ? 130 : 60)) / 768) * k);
    }
    context.render(this.roomLabel);
    context.render(this.ownership);
  }
  destroy() {
    this.cancelPending();
    this.node?.destroy();
    this.runtime?.destroy();
    this.roomLabel.destroy();
    this.ownership.destroy();
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
await startExample(app, () => app.start(LevelOwnershipScene));
