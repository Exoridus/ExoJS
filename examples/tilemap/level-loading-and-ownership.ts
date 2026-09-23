import { Application, Asset, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { MapLevelSide, MapWorld, MapWorldRuntime } from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';

const ROOM_SIZE = { x: 0, y: 0, width: 1280, height: 768 };
const world = new MapWorld({
  name: 'Two Rooms',
  levels: [
    { id: 'harbor', name: 'Harbor', index: 0, bounds: ROOM_SIZE, external: true, neighbours: [{ id: 'workshop', side: MapLevelSide.East }], properties: {} },
    { id: 'workshop', name: 'Workshop', index: 1, bounds: ROOM_SIZE, external: true, neighbours: [{ id: 'harbor', side: MapLevelSide.West }], properties: {} },
  ],
});

const roomPath: Record<string, string> = {
  harbor: 'json/maps/harbor-plaza.tmj',
  workshop: 'json/maps/ownership-workshop.tmj',
};

const waitForTransition = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Transition cancelled.', 'AbortError'));
      return;
    }
    const onAbort = (): void => {
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
  private runtime!: MapWorldRuntime;
  private node: TileMapNode | null = null;
  private activeId: string | null = null;
  private pendingId: string | null = null;
  private readonly roomLabel = new Text('No room loaded', { fillColor: new Color(31, 49, 54), fontSize: 34 });
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof mountControlPanel>;

  override init(): void {
    this.roomLabel.position.set(470, 80);
    this.runtime = new MapWorldRuntime({
      world,
      scope: this.loader,
      load: async ({ level, scope, signal }) => {
        await waitForTransition(signal);
        return scope.load(Asset.type('tileMap', roomPath[level.id]!));
      },
    });
    this.hud = mountControls({
      title: 'Level Loading and Asset Ownership',
      controls: [{ keys: 'Panel', action: 'load a room, cancel a pending load, or unload it' }],
      status: 'Each room gets a child loader scope. Both maps reference the same atlas.',
      hint: 'A short delay makes cancellation observable; the map and its asset scope remain owned by MapWorldRuntime.',
    });
    this.panel = mountControlPanel({ title: 'Rooms' });
    this.panel.addButton({
      label: 'Enter Harbor',
      onClick: () => {
        void this.enter('harbor');
      },
    });
    this.panel.addButton({
      label: 'Enter Workshop',
      onClick: () => {
        void this.enter('workshop');
      },
    });
    this.panel.addButton({ label: 'Cancel pending', onClick: () => this.cancelPending() });
    this.panel.addButton({ label: 'Unload room', onClick: () => this.unloadActive() });
    void this.enter('harbor');
  }

  private async enter(id: string): Promise<void> {
    if (this.pendingId) this.cancelPending();
    if (id === this.activeId) return;
    this.pendingId = id;
    this.hud.setStatus(`Loading ${world.getLevel(id)?.name}... ${this.describeResidency()}`);
    try {
      const level = await this.runtime.loadLevel(id);
      if (this.pendingId !== id) return;
      const previousId = this.activeId;
      this.node?.destroy();
      this.node = new TileMapNode(level.map);
      this.node.position.set(96, 34);
      this.node.scale.set(0.85);
      this.activeId = id;
      this.roomLabel.text = `${level.level.name} loaded`;
      if (previousId) this.runtime.unloadLevel(previousId);
      this.hud.setStatus(`${level.level.name} ready. ${this.describeResidency()}`);
    } catch (error) {
      if (this.pendingId === id) this.hud.setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (this.pendingId === id) this.pendingId = null;
    }
  }

  private cancelPending(): void {
    if (!this.pendingId) return;
    const id = this.pendingId;
    this.pendingId = null;
    this.runtime.unloadLevel(id);
    this.hud.setStatus(`${world.getLevel(id)?.name} cancelled. ${this.describeResidency()}`);
  }

  private unloadActive(): void {
    if (!this.activeId) return;
    const id = this.activeId;
    this.node?.destroy();
    this.node = null;
    this.activeId = null;
    this.runtime.unloadLevel(id);
    this.roomLabel.text = 'No room loaded';
    this.hud.setStatus(`${world.getLevel(id)?.name} unloaded. ${this.describeResidency()}`);
  }

  private describeResidency(): string {
    const atlas = this.app.loader.inspect().find(row => row.aliases.some(alias => alias.includes('mapPack_tilesheet')));
    return `${this.runtime.levels.length} live room(s), shared atlas ${atlas?.claims ?? 0} claim(s)`;
  }

  override draw(context: RenderingContext): void {
    if (this.node) context.render(this.node);
    context.render(this.roomLabel);
  }

  override destroy(): void {
    this.cancelPending();
    this.node?.destroy();
    this.runtime?.destroy();
    this.roomLabel.destroy();
    this.hud?.dispose();
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { LevelOwnershipScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(28, 36, 46),
  extensions: [tiledExtension],
  loader: { basePath: 'assets/' },
});

await app.start(LevelOwnershipScene);
