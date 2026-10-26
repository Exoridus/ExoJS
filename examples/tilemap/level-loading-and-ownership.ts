import { Application, Asset, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Text } from '@codexo/exojs';
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

const roomPath: Record<string, string> = {
  harbor: assets.harborPlazaMap.source,
  workshop: assets.ownershipWorkshopMap.source,
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
  private pending: { readonly id: string } | null = null;
  private outcome = 'Waiting';
  private readonly roomLabel = new Text('No room loaded', { fillColor: new Color(236, 239, 242), fontSize: 34 });
  private readonly ownership = new Text('', { fillColor: new Color(236, 239, 242) });
  private panel!: ReturnType<typeof demoPanel>;

  override init(): void {
    this.runtime = new MapWorldRuntime({
      world,
      scope: this.loader,
      load: async ({ level, scope, signal }) => {
        await waitForTransition(signal);

        return scope.load(Asset.type('tileMap', roomPath[level.id]!));
      },
    });
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
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

  private async enter(id: string): Promise<void> {
    this.cancelPending();

    if (id === this.activeId) {
      return;
    }

    // A fresh object per request: a cancelled request for the same level id
    // settles after its replacement started, and must not touch its state.
    const request = { id };

    this.pending = request;
    this.outcome = 'Loading (simulated 750 ms cancellation window)';
    this.panel.status(this.describeResidency());

    try {
      const level = await this.runtime.loadLevel(id);

      if (this.pending !== request) {
        return;
      }

      const previousId = this.activeId;

      this.node?.destroy();
      this.node = new TileMapNode(level.map);
      this.activeId = id;
      this.outcome = `${level.level.name} loaded`;

      if (previousId) {
        this.runtime.unloadLevel(previousId);
      }

      this.panel.status(this.describeResidency());
    } catch (error) {
      if (this.pending === request) {
        this.outcome = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (this.pending === request) {
        this.pending = null;
        this.panel.status(this.describeResidency());
      }
    }
  }

  private cancelPending(): void {
    if (!this.pending) {
      return;
    }

    const { id } = this.pending;

    this.pending = null;
    this.runtime.unloadLevel(id);
    this.outcome = `Cancelled ${world.getLevel(id)?.name}; pending resources released`;
    this.panel.status(this.describeResidency());
  }

  private unloadActive(): void {
    this.cancelPending();

    if (!this.activeId) {
      return;
    }

    const id = this.activeId;
    this.node?.destroy();
    this.node = null;
    this.activeId = null;
    this.runtime.unloadLevel(id);
    this.outcome = `${world.getLevel(id)?.name} unloaded; resources released`;
    this.panel.status(this.describeResidency());
  }

  private describeResidency(): string {
    const rows = this.app.loader.inspect();
    const atlas = rows.find(row => row.aliases.includes(assets.mapPackTilesheet.source));
    this.roomLabel.text = `Current: ${this.activeId ? world.getLevel(this.activeId)?.name : 'none'} | Requested: ${this.pending ? world.getLevel(this.pending.id)?.name : 'none'}`;
    this.panel.actions['Cancel pending']!.enabled = this.pending !== null;
    this.panel.actions['Unload room']!.enabled = this.activeId !== null || this.pending !== null;
    this.ownership.text = `Shared atlas: ${atlas?.claims ?? 0} claim(s)\n${Object.entries(roomPath)
      .map(([id, path]) => {
        const room = rows.find(row => row.aliases.some(alias => alias.includes(path)));

        return `${world.getLevel(id)?.name} map: ${room?.claims ?? 0} claim(s)`;
      })
      .join('\n')}`;

    return `${this.outcome} | ${this.runtime.levels.length} live room(s), shared atlas ${atlas?.claims ?? 0} claim(s)`;
  }

  override draw(context: RenderingContext): void {
    const { scale: k, width, contentHeight, compact } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.roomLabel.style.fontSize = 18 * k;
    this.roomLabel.setPosition(16 * k, 12 * k);
    this.ownership.style.fontSize = 14 * k;
    this.ownership.setPosition((compact ? 16 : width * 0.64) * k, (compact ? contentHeight - 76 : 70) * k);

    if (this.node) {
      this.node.setPosition(0, 42 * k);
      this.node.setScale(Math.min((compact ? width : width * 0.61) / 1280, Math.max(30, contentHeight - (compact ? 130 : 60)) / 768) * k);
      context.render(this.node);
    }

    context.render(this.roomLabel);
    context.render(this.ownership);
  }

  override destroy(): void {
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
