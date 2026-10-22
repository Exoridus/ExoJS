import {
  AnimatedSprite,
  Application,
  Asset,
  type AudioStream,
  BitmapText,
  type BmFont,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type LoaderScope,
  type Rectangle,
  type RenderingContext,
  type RenderNode,
  ScaleModes,
  Scene,
  type Seconds,
  type Sound,
  Sprite,
  Spritesheet,
  type SpritesheetData,
  Text,
  Texture,
  View,
  type Voice,
} from '@codexo/exojs';
import { ObjectKind, type TileMap, TileMapNode } from '@codexo/exojs/tilemap';
import { demoAssetCategories, type DemoAssetCategory, type DemoAssetKey, demoAssets as assets } from '@codexo/exojs-demo-assets';
import { ldtkExtension } from '@codexo/exojs-ldtk';
import { tiledExtension } from '@codexo/exojs-tiled';
import { choice, type DemoControlSpec, demoPanel, slider, toggle } from '@examples/runtime';

// An asset browser for the standard demo catalog. It is an ordinary scene:
//
//   - The list is derived from `demoAssets` and `demoAssetCategories`; nothing
//     is fetched until an entry is selected.
//   - Every selection loads into a child `LoaderScope` of the scene. Selecting
//     something else destroys that scope, which cancels a load still in flight
//     and frees what it held - unless another scope holds the same asset.
//   - Each selection carries a generation number. A load that settles after a
//     newer selection is discarded before it can show, play or log anything.
//   - Nothing plays on selection. Play goes through `app.audio.onUnlock`, which
//     waits for the browser's autoplay gesture and is cancelled on switch.
//   - "Code" turns the current preview settings into a complete scene.

const STAGE = { width: 1280, height: 720 };
const SIDEBAR_WIDTH = 272;
const INSPECTOR_WIDTH = 332;
const PREVIEW = { x: SIDEBAR_WIDTH, y: 0, width: STAGE.width - SIDEBAR_WIDTH - INSPECTOR_WIDTH, height: STAGE.height };
const PREVIEW_CENTER = { x: PREVIEW.x + PREVIEW.width / 2, y: PREVIEW.height / 2 };
const FONT = '"Segoe UI", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const MANIFEST_URL = import.meta.resolve('@codexo/exojs-demo-assets/manifest.json');

type Group = 'Textures' | 'Spritesheets' | 'Maps' | 'Audio' | 'Video' | 'Fonts' | 'Data';
type Kind = 'texture' | 'svg' | 'spritesheet' | 'tiled' | 'ldtk' | 'sound' | 'music' | 'video' | 'font' | 'bmFont' | 'data';

interface BrowserItem {
  readonly id: string;
  readonly name: string;
  readonly group: Group;
  readonly kind: Kind;
  readonly key: DemoAssetKey;
  /** The atlas JSON of a spritesheet; `key` is its image. */
  readonly atlasKey?: DemoAssetKey;
}

/** The fields of the package's `manifest.json` this browser reads. */
interface DemoManifest {
  readonly entries: ReadonlyArray<{
    readonly key: string;
    readonly bytes: number;
    readonly path: string;
    readonly media?: {
      readonly container?: string;
      readonly durationSeconds?: number;
      readonly dynamicRange?: string;
      readonly video?: {
        codec?: string;
        profile?: string;
        width?: number;
        height?: number;
        frameRate?: string;
        pixelFormat?: string;
        bitDepth?: number;
      };
      readonly audio?: { codec?: string; sampleRate?: number; channels?: number };
    };
  }>;
}

const GROUP_OF: Record<DemoAssetCategory, Group> = {
  textures: 'Textures',
  technical: 'Textures',
  backgrounds: 'Textures',
  icons: 'Textures',
  cursors: 'Textures',
  spritesheets: 'Spritesheets',
  inputPrompts: 'Spritesheets',
  maps: 'Maps',
  sound: 'Audio',
  soundSprites: 'Audio',
  music: 'Audio',
  voice: 'Audio',
  impulseResponses: 'Audio',
  video: 'Video',
  fonts: 'Fonts',
};
const GROUP_ORDER: readonly Group[] = ['Textures', 'Spritesheets', 'Maps', 'Audio', 'Video', 'Fonts', 'Data'];
const GROUP_GLYPH: Record<Kind, string> = {
  texture: 'IMG',
  svg: 'SVG',
  spritesheet: 'ATL',
  tiled: 'MAP',
  ldtk: 'MAP',
  sound: 'SND',
  music: 'MUS',
  video: 'VID',
  font: 'TTF',
  bmFont: 'FNT',
  data: '{ }',
};

const humanize = (key: string): string => {
  const words = key
    .replace(/^(sound|music|font)(?=[A-Z])/, '')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
};

const kindOf = (key: DemoAssetKey): Kind => {
  const descriptor = assets[key];

  switch (descriptor.type) {
    case 'texture':
    case 'svg':
    case 'sound':
    case 'music':
    case 'video':
    case 'font':
    case 'bmFont':
      return descriptor.type as Kind;
    case 'json':
      if (demoAssetCategories[key] !== 'maps') {
        return 'data';
      }

      return descriptor.source.endsWith('.ldtk') ? 'ldtk' : 'tiled';
    default:
      return 'data';
  }
};

/** An atlas JSON and its image are separate descriptors named `<name>Atlas` and `<name>Image`; the browser lists them as one spritesheet. */
const buildItems = (): BrowserItem[] => {
  const items: BrowserItem[] = [];

  for (const key of Object.keys(demoAssetCategories) as DemoAssetKey[]) {
    const base = key.replace(/(Atlas|Image)$/, '');
    const image = `${base}Image` as DemoAssetKey;
    const atlas = `${base}Atlas` as DemoAssetKey;

    if (base !== key && image in assets && atlas in assets) {
      if (key === image) {
        items.push({ id: base, name: humanize(base), group: 'Spritesheets', kind: 'spritesheet', key: image, atlasKey: atlas });
      }

      continue;
    }

    const kind = kindOf(key);

    items.push({ id: key, name: humanize(key), group: kind === 'data' ? 'Data' : GROUP_OF[demoAssetCategories[key]], kind, key });
  }

  return items;
};

const ITEMS = buildItems();
const GROUPS = GROUP_ORDER.filter(group => ITEMS.some(item => item.group === group));

const fileName = (source: string): string => decodeURIComponent(source.slice(source.lastIndexOf('/') + 1));
const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const formatSeconds = (value: number): string => (Number.isFinite(value) ? `${value.toFixed(2)} s` : 'unknown');
const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/** What the scene hands a preview: the selection's own scope and a way to ask whether it is still the current one. */
interface PreviewContext {
  readonly scene: AssetBrowserScene;
  readonly item: BrowserItem;
  readonly scope: LoaderScope;
  readonly manifest: DemoManifest['entries'][number] | undefined;
  isCurrent(): boolean;
}

/** What the scene asks of a preview once its assets are loaded. */
interface Preview {
  /** Content drawn through the pan-and-zoom camera; its top-left is the world origin. */
  readonly world: RenderNode[];
  /** Content drawn in canvas pixels above the world. */
  readonly overlay: RenderNode[];
  /** The size of the world content, for fitting it into view; `null` when nothing pans. */
  readonly bounds: { readonly width: number; readonly height: number } | null;
  readonly facts: ReadonlyArray<readonly [string, string]>;
  /** Mounts the controls. Runs only for the current selection, after every load settled. */
  mount(panel: PanelHost): void;
  update?(delta: Seconds): void;
  /** A tap on the world content, in world coordinates. */
  tap?(x: number, y: number): void;
  snippet(): string;
  /** Loads the raw JSON behind the preview, for the Data view. */
  data?(): Promise<unknown>;
  /** Stops playback and destroys what the preview created; loaded assets belong to the scope. */
  dispose(): void;
}

/** Mounts a preview's control panel inside the inspector column. */
type PanelHost = <const C extends Record<string, DemoControlSpec>>(
  options: Parameters<typeof demoPanel<C>>[0],
) => ReturnType<typeof demoPanel<C>>;

class AssetBrowserScene extends Scene {
  private readonly sidebar = document.createElement('nav');
  private readonly search = document.createElement('input');
  private readonly tabs = document.createElement('div');
  private readonly list = document.createElement('ul');
  private readonly inspector = document.createElement('aside');
  private readonly heading = document.createElement('h2');
  private readonly facts = document.createElement('dl');
  private readonly panelSlot = document.createElement('div');
  private readonly resident = document.createElement('details');
  private readonly codePanel = document.createElement('section');
  private readonly codeTitle = document.createElement('strong');
  private readonly code = document.createElement('pre');
  private readonly buttons = new Map<string, HTMLButtonElement>();

  private readonly view = new View(STAGE.width / 2, STAGE.height / 2, STAGE.width, STAGE.height);
  private readonly frame = new Graphics();
  private readonly message = new Text('', { fontSize: 22, fillColor: new Color(200, 214, 236), align: 'center' });
  private backdrop = new Color(32, 37, 50);

  private group: Group = GROUPS[0]!;
  private selected: BrowserItem | null = null;
  private generation = 0;
  private scope: LoaderScope | null = null;
  private preview: Preview | null = null;
  private panel: { dispose(): void } | null = null;
  private manifest = new Map<string, DemoManifest['entries'][number]>();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private zoomTarget: { set(key: 'zoom', value: number): void } | null = null;
  private destroyed = false;

  override async load(): Promise<void> {
    // The package's manifest carries byte sizes and media metadata. It is
    // optional here: without it the inspector only shows what loading tells.
    try {
      const manifest = await this.loader.load(Asset.type<DemoManifest>('json', MANIFEST_URL));

      this.manifest = new Map(manifest.entries.map(entry => [entry.key, entry]));
    } catch (error) {
      console.warn('The demo asset manifest is unavailable; sizes and media details are hidden.', error);
    }
  }

  override init(): void {
    this.mountSidebar();
    this.mountInspector();
    this.mountCodePanel();
    this.message.setAnchor(0.5).setPosition(PREVIEW_CENTER.x, PREVIEW_CENTER.y);
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onPointerUp.add(this.onPointerUp);
    this.app.input.onMouseWheel.add(this.onWheel);
    this.showGroup(this.group);
    void this.select(ITEMS.find(item => item.group === this.group)!);
  }

  // --- Selection ------------------------------------------------------------

  async select(item: BrowserItem): Promise<void> {
    const generation = ++this.generation;

    this.closePreview();
    this.selected = item;
    this.markSelection();
    this.renderFacts(item, []);
    this.message.text = 'Loading...';

    const scope = this.loader.createScope({ name: `preview:${item.id}` });
    const started = performance.now();

    this.scope = scope;

    const context: PreviewContext = {
      scene: this,
      item,
      scope,
      manifest: this.manifest.get(item.key),
      isCurrent: () => generation === this.generation && !this.destroyed,
    };

    try {
      const preview = await openPreview(context);

      // A newer selection destroyed this scope already; what the preview built
      // is dropped without ever being shown.
      if (!context.isCurrent()) {
        preview.dispose();

        return;
      }

      this.preview = preview;
      this.message.text = '';
      this.renderFacts(item, preview.facts);
      this.mountPanel(preview);
      this.fit();
      this.renderResident();
      console.info(`Loaded ${item.name} (${item.kind}) in ${Math.round(performance.now() - started)} ms`);
    } catch (error) {
      if (!context.isCurrent() || isAbort(error)) {
        return;
      }

      this.message.text = `Could not load ${item.name}`;
      this.renderResident();
      console.error(`Failed to load ${item.name}:`, error);
    }
  }

  private closePreview(): void {
    this.hideCode();
    this.panel?.dispose();
    this.panel = null;
    this.zoomTarget = null;
    this.backdrop = new Color(32, 37, 50);

    try {
      this.preview?.dispose();
    } finally {
      this.preview = null;
      // Destroying the scope cancels a load that is still running and releases
      // this selection's claims; assets another scope holds stay resident.
      this.scope?.destroy();
      this.scope = null;
    }
  }

  private mountPanel(preview: Preview): void {
    const host: PanelHost = options => {
      const panel = demoPanel({ ...options, corner: 'top-right' });

      Object.assign(panel.element.style, {
        position: 'static',
        maxWidth: 'none',
        minWidth: '0',
        padding: '10px',
        boxShadow: 'none',
        margin: '0',
      });

      // The shared panel is sized for a canvas corner; in this column the
      // sliders give way so every readout stays visible.
      for (const input of panel.element.querySelectorAll('input')) {
        input.style.minWidth = '0';
      }

      this.panelSlot.replaceChildren(panel.element);
      this.panel = panel;

      return panel;
    };

    preview.mount(host);
  }

  /** The camera always zooms through the panel's Zoom control when a preview has one. */
  bindZoom(target: { set(key: 'zoom', value: number): void } | null): void {
    this.zoomTarget = target;
  }

  setZoom(zoom: number): void {
    const center = this.view.center;

    // Zoom about the preview's centre, which is offset from the canvas centre.
    const focusX = center.x + (PREVIEW_CENTER.x - STAGE.width / 2) / this.view.zoomLevel;
    const focusY = center.y + (PREVIEW_CENTER.y - STAGE.height / 2) / this.view.zoomLevel;

    this.view.setZoom(zoom);
    this.lookAt(focusX, focusY);
  }

  /** Puts world point (x, y) at the centre of the preview area. */
  lookAt(x: number, y: number): void {
    const zoom = this.view.zoomLevel;

    this.view.setCenter(x - (PREVIEW_CENTER.x - STAGE.width / 2) / zoom, y - (PREVIEW_CENTER.y - STAGE.height / 2) / zoom);
  }

  fit(): void {
    const bounds = this.preview?.bounds;

    if (!bounds) {
      this.view.setZoom(1);
      this.lookAt(0, 0);

      return;
    }

    const zoom = Math.min(8, (PREVIEW.width * 0.9) / bounds.width, (PREVIEW.height * 0.82) / bounds.height);

    this.view.setZoom(zoom);
    this.lookAt(bounds.width / 2, bounds.height / 2);
    this.zoomTarget?.set('zoom', zoom);
  }

  setBackdrop(color: Color): void {
    this.backdrop = color;
  }

  // --- Pointer: drag pans, wheel zooms, tap hits ----------------------------

  private readonly onPointerDown = (_pointer: unknown, x: number, y: number): void => {
    if (x >= PREVIEW.x && x <= PREVIEW.x + PREVIEW.width) {
      this.drag = { x, y, moved: false };
    }
  };

  private readonly onPointerMove = (_pointer: unknown, x: number, y: number): void => {
    if (!this.drag || !this.preview?.bounds) {
      return;
    }

    const dx = x - this.drag.x;
    const dy = y - this.drag.y;

    if (this.drag.moved || Math.hypot(dx, dy) > 4) {
      const zoom = this.view.zoomLevel;

      this.view.setCenter(this.view.center.x - dx / zoom, this.view.center.y - dy / zoom);
      this.drag = { x, y, moved: true };
    }
  };

  private readonly onPointerUp = (_pointer: unknown, x: number, y: number): void => {
    const drag = this.drag;

    this.drag = null;

    if (drag && !drag.moved && this.preview?.tap) {
      // The four-argument form maps through the viewport at any zoom level;
      // the stage's design size stands in for the canvas size.
      const point = this.view.screenToWorld(x, y, STAGE.width, STAGE.height);

      this.preview.tap(point.x, point.y);
    }
  };

  private readonly onWheel = (_deltaX: number, deltaY: number): void => {
    if (!this.preview?.bounds) {
      return;
    }

    const zoom = Math.min(32, Math.max(0.05, this.view.zoomLevel * Math.exp(-deltaY * 0.0015)));

    if (this.zoomTarget) {
      this.zoomTarget.set('zoom', zoom);
    } else {
      this.setZoom(zoom);
    }
  };

  // --- Frame ----------------------------------------------------------------

  override update(delta: Seconds): void {
    this.preview?.update?.(delta);
  }

  override draw(context: RenderingContext): void {
    context.clear(this.backdrop);

    for (const node of this.preview?.world ?? []) {
      context.render(node, { view: this.view });
    }

    for (const node of this.preview?.overlay ?? []) {
      context.render(node, { view: context.screenView });
    }

    if (this.message.text) {
      context.render(this.message, { view: context.screenView });
    }
  }

  override destroy(): void {
    this.destroyed = true;
    this.generation += 1;
    this.closePreview();
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onPointerUp.remove(this.onPointerUp);
    this.app.input.onMouseWheel.remove(this.onWheel);
    this.sidebar.remove();
    this.inspector.remove();
    this.codePanel.remove();
    this.frame.destroy();
    this.message.destroy();
    this.view.destroy();
    super.destroy();
  }

  // --- Sidebar --------------------------------------------------------------

  private mountSidebar(): void {
    Object.assign(this.sidebar.style, {
      position: 'fixed',
      inset: `0 auto 0 0`,
      width: `${SIDEBAR_WIDTH}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '14px 12px',
      boxSizing: 'border-box',
      background: '#0b1019',
      borderRight: '1px solid rgba(154, 193, 255, 0.18)',
      color: '#f3f7ff',
      font: `15px ${FONT}`,
      zIndex: '5',
    });
    this.sidebar.setAttribute('aria-label', 'Demo assets');

    this.search.type = 'search';
    this.search.placeholder = `Search ${ITEMS.length} assets`;
    this.search.setAttribute('aria-label', 'Search assets');
    Object.assign(this.search.style, {
      padding: '8px 10px',
      border: '1px solid rgba(154, 193, 255, 0.32)',
      borderRadius: '8px',
      background: 'rgba(154, 193, 255, 0.08)',
      color: 'inherit',
      font: 'inherit',
    });
    this.search.addEventListener('input', () => this.renderList());

    Object.assign(this.tabs.style, { display: 'flex', flexWrap: 'wrap', gap: '5px' });
    this.tabs.setAttribute('role', 'group');
    this.tabs.setAttribute('aria-label', 'Asset types');

    for (const group of GROUPS) {
      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = `${group} ${ITEMS.filter(item => item.group === group).length}`;
      button.dataset.group = group;
      Object.assign(button.style, chipStyle(false));
      button.addEventListener('click', () => {
        this.showGroup(group);
        const first = this.visibleItems()[0];

        if (first && first.group !== this.selected?.group) {
          void this.select(first);
        }
      });
      this.tabs.append(button);
    }

    Object.assign(this.list.style, { flex: '1 1 auto', overflowY: 'auto', listStyle: 'none', margin: '0', padding: '0' });
    this.list.setAttribute('aria-label', 'Assets');
    this.list.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }

      event.preventDefault();
      const visible = this.visibleItems();
      const index = visible.findIndex(item => item === this.selected);
      const next = visible[(index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length];

      if (next) {
        void this.select(next);
        this.buttons.get(next.id)?.focus();
      }
    });

    this.sidebar.append(this.search, this.tabs, this.list);
    document.body.append(this.sidebar);
  }

  private showGroup(group: Group): void {
    this.group = group;
    this.search.value = '';

    for (const button of this.tabs.querySelectorAll('button')) {
      Object.assign(button.style, chipStyle(button.dataset.group === group));
      button.setAttribute('aria-pressed', String(button.dataset.group === group));
    }

    this.renderList();
  }

  private visibleItems(): BrowserItem[] {
    const query = this.search.value.trim().toLowerCase();

    return query
      ? ITEMS.filter(item => item.name.toLowerCase().includes(query) || item.key.toLowerCase().includes(query))
      : ITEMS.filter(item => item.group === this.group);
  }

  private renderList(): void {
    const searching = this.search.value.trim() !== '';

    this.buttons.clear();
    this.list.replaceChildren(
      ...this.visibleItems().map(item => {
        const row = document.createElement('li');
        const button = document.createElement('button');
        const glyph = document.createElement('span');
        const label = document.createElement('span');

        button.type = 'button';
        button.dataset.asset = item.id;
        glyph.textContent = GROUP_GLYPH[item.kind];
        glyph.setAttribute('aria-hidden', 'true');
        Object.assign(glyph.style, { flex: '0 0 34px', font: `600 10px ${MONO}`, color: '#7fb8ff', textAlign: 'center' });
        label.textContent = searching ? `${item.name} - ${item.group}` : item.name;
        Object.assign(label.style, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
        Object.assign(button.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          minHeight: '34px',
          padding: '4px 6px',
          textAlign: 'left',
          border: '0',
          borderRadius: '7px',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        });
        button.append(glyph, label);
        button.addEventListener('click', () => void this.select(item));
        this.buttons.set(item.id, button);
        row.append(button);

        return row;
      }),
    );
    this.markSelection();
  }

  private markSelection(): void {
    for (const [id, button] of this.buttons) {
      const current = id === this.selected?.id;

      button.style.background = current ? 'rgba(127, 184, 255, 0.26)' : 'transparent';
      button.setAttribute('aria-current', String(current));

      if (current) {
        button.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  // --- Inspector ------------------------------------------------------------

  private mountInspector(): void {
    Object.assign(this.inspector.style, {
      position: 'fixed',
      inset: `0 0 0 auto`,
      width: `${INSPECTOR_WIDTH}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '14px',
      boxSizing: 'border-box',
      overflowY: 'auto',
      background: '#0b1019',
      borderLeft: '1px solid rgba(154, 193, 255, 0.18)',
      color: '#dce8ff',
      font: `14px ${FONT}`,
      zIndex: '5',
    });
    this.inspector.setAttribute('aria-label', 'Selected asset');
    Object.assign(this.heading.style, { margin: '0', fontSize: '19px', color: '#ffffff' });
    Object.assign(this.facts.style, { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', margin: '0', fontSize: '13px' });
    Object.assign(this.resident.style, { marginTop: 'auto', fontSize: '12px', color: '#8aa0c4' });
    this.inspector.append(this.heading, this.facts, this.panelSlot, this.resident);
    document.body.append(this.inspector);
  }

  private renderFacts(item: BrowserItem, facts: ReadonlyArray<readonly [string, string]>): void {
    const manifest = this.manifest.get(item.key);
    const rows: Array<readonly [string, string]> = [
      ['Asset', `assets.${item.key}`],
      ['File', fileName(assets[item.key].source)],
      ...(manifest
        ? [['Size', formatBytes(manifest.bytes + (item.atlasKey ? (this.manifest.get(item.atlasKey)?.bytes ?? 0) : 0))] as const]
        : []),
      ...facts,
    ];

    this.heading.textContent = item.name;
    this.facts.replaceChildren(
      ...rows.flatMap(([term, value]) => {
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');

        dt.textContent = term;
        dd.textContent = value;
        dt.style.color = '#8aa0c4';
        Object.assign(dd.style, { margin: '0', overflowWrap: 'anywhere', color: '#f3f7ff' });

        return [dt, dd];
      }),
    );
  }

  /** Lists what the loader holds right now: the manifest plus the current selection, never an earlier one. */
  private renderResident(): void {
    const rows = this.app.loader.inspect();
    const summary = document.createElement('summary');
    const list = document.createElement('ul');

    summary.textContent = `Loader holds ${rows.length} asset${rows.length === 1 ? '' : 's'}`;
    summary.style.cursor = 'pointer';
    Object.assign(list.style, { margin: '6px 0 0', paddingLeft: '16px', font: `11px ${MONO}` });
    list.append(
      ...rows.map(row => {
        const entry = document.createElement('li');

        entry.textContent = `${fileName(row.locator)} (${row.state})`;

        return entry;
      }),
    );
    this.resident.dataset.residentCount = String(rows.length);
    this.resident.replaceChildren(summary, list);
  }

  // --- Code and data panel --------------------------------------------------

  private mountCodePanel(): void {
    const header = document.createElement('div');
    const copy = document.createElement('button');
    const close = document.createElement('button');

    Object.assign(this.codePanel.style, {
      position: 'fixed',
      left: `${PREVIEW.x + 12}px`,
      width: `${PREVIEW.width - 24}px`,
      bottom: '12px',
      maxHeight: '420px',
      display: 'none',
      flexDirection: 'column',
      borderRadius: '10px',
      border: '1px solid rgba(154, 193, 255, 0.3)',
      background: 'rgba(8, 12, 20, 0.96)',
      color: '#f3f7ff',
      font: `14px ${FONT}`,
      zIndex: '6',
    });
    this.codePanel.setAttribute('aria-label', 'Code');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px' });
    this.codeTitle.style.flex = '1 1 auto';

    for (const [button, label] of [
      [copy, 'Copy'],
      [close, 'Close'],
    ] as const) {
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, chipStyle(false));
    }

    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.code.textContent ?? '').then(
        () => {
          copy.textContent = 'Copied';
          console.log(`Copied the ${this.codeTitle.textContent ?? 'code'} to the clipboard`);
        },
        (error: unknown) => console.warn('The clipboard refused the copy:', error),
      );
    });
    copy.addEventListener('blur', () => (copy.textContent = 'Copy'));
    close.addEventListener('click', () => this.hideCode());
    Object.assign(this.code.style, {
      margin: '0',
      padding: '0 12px 12px',
      overflow: 'auto',
      font: `13px/1.45 ${MONO}`,
      whiteSpace: 'pre',
      color: '#dce8ff',
    });
    this.code.tabIndex = 0;
    header.append(this.codeTitle, copy, close);
    this.codePanel.append(header, this.code);
    document.body.append(this.codePanel);
  }

  showCode(): void {
    if (this.preview) {
      this.openCodePanel('Code', this.preview.snippet());
    }
  }

  async showData(): Promise<void> {
    const preview = this.preview;
    const generation = this.generation;

    if (!preview?.data) {
      return;
    }

    this.openCodePanel('Data', 'Loading...');

    try {
      const data = await preview.data();

      if (generation !== this.generation) {
        return;
      }

      const text = JSON.stringify(data, null, 2);
      const limit = 60_000;

      this.openCodePanel('Data', text.length > limit ? `${text.slice(0, limit)}\n... ${text.length - limit} more characters` : text);
    } catch (error) {
      if (generation === this.generation && !isAbort(error)) {
        this.openCodePanel('Data', `Could not load the data: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private openCodePanel(title: string, text: string): void {
    this.codeTitle.textContent = title;
    this.code.textContent = text;
    this.codePanel.style.display = 'flex';
  }

  private hideCode(): void {
    this.codePanel.style.display = 'none';
  }
}

const chipStyle = (active: boolean): Partial<CSSStyleDeclaration> => ({
  padding: '4px 9px',
  border: `1px solid ${active ? 'rgba(127, 184, 255, 0.7)' : 'rgba(154, 193, 255, 0.28)'}`,
  borderRadius: '999px',
  background: active ? 'rgba(127, 184, 255, 0.24)' : 'transparent',
  color: active ? '#ffffff' : '#c4d2ec',
  font: `600 12px ${FONT}`,
  cursor: 'pointer',
});

// --- Previews ---------------------------------------------------------------

const openPreview = (context: PreviewContext): Promise<Preview> => {
  switch (context.item.kind) {
    case 'texture':
    case 'svg':
      return openTexture(context);
    case 'spritesheet':
      return openSpritesheet(context);
    case 'tiled':
    case 'ldtk':
      return openMap(context);
    case 'sound':
    case 'music':
      return openAudio(context);
    case 'video':
      return openVideo(context);
    case 'font':
    case 'bmFont':
      return openFont(context);
    case 'data':
      return openData(context);
  }
};

const BACKDROPS = { Checker: null, Dark: new Color(32, 37, 50), Light: new Color(236, 239, 244), Black: new Color(0, 0, 0) } as const;
const BACKDROP_NAMES = Object.keys(BACKDROPS) as Array<keyof typeof BACKDROPS>;

/** A transparency checkerboard behind a `width` x `height` image. */
const checkerboard = (width: number, height: number): Graphics => {
  const graphics = new Graphics();
  const cell = Math.max(4, Math.round(Math.max(width, height) / 32));

  graphics.fillColor = new Color(58, 64, 78);
  graphics.drawRectangle(0, 0, width, height);
  graphics.fillColor = new Color(86, 93, 110);

  for (let y = 0; y < height; y += cell) {
    for (let x = (y / cell) % 2 === 0 ? 0 : cell; x < width; x += cell * 2) {
      graphics.drawRectangle(x, y, Math.min(cell, width - x), Math.min(cell, height - y));
    }
  }

  return graphics;
};

const zoomSlider = (value = 1) => slider('Zoom', { min: 0.05, max: 16, step: 0.05, value, format: zoom => `${Math.round(zoom * 100)}%` });

const openTexture = async ({ scene, item, scope }: PreviewContext): Promise<Preview> => {
  const descriptor = assets[item.key];
  const svg = descriptor.type === 'svg';
  // An SVG loads as an image element; a texture over it is this preview's to destroy.
  const texture = svg
    ? new Texture(await scope.load(descriptor as typeof assets.iconPlay))
    : await scope.load(descriptor as typeof assets.ship);
  const sprite = new Sprite(texture);
  const backdrop = checkerboard(texture.width, texture.height);
  const state = { zoom: 1, nearest: false, backdrop: 'Checker' as keyof typeof BACKDROPS };

  return {
    world: [backdrop, sprite],
    overlay: [],
    bounds: { width: texture.width, height: texture.height },
    facts: [
      ['Pixels', `${texture.width} x ${texture.height}`],
      ['Format', svg ? 'SVG, rasterized at its intrinsic size' : (fileName(descriptor.source).split('.').pop() ?? '').toUpperCase()],
    ],
    mount(host) {
      const panel = host({
        title: 'Texture',
        controls: {
          zoom: zoomSlider(),
          filtering: choice('Filtering', ['Linear', 'Nearest'] as const),
          backdrop: choice('Backdrop', BACKDROP_NAMES),
        },
        actions: { Fit: () => scene.fit(), '100%': () => panel.set('zoom', 1), Code: () => scene.showCode() },
        onChange(key, _value, values) {
          state.zoom = values.zoom;
          state.nearest = values.filtering === 'Nearest';
          state.backdrop = values.backdrop;

          if (key === 'zoom') {
            scene.setZoom(values.zoom);
          } else if (key === 'filtering') {
            // Sampling is per texture handle; this preview's scope owns this one.
            texture.scaleMode = state.nearest ? ScaleModes.Nearest : ScaleModes.Linear;
          } else if (key === 'backdrop') {
            backdrop.visible = values.backdrop === 'Checker';
            scene.setBackdrop(BACKDROPS[values.backdrop] ?? new Color(32, 37, 50));
          }
        },
      });

      scene.bindZoom(panel);
    },
    snippet: () =>
      textureSnippet(item, {
        zoom: state.zoom,
        nearest: state.nearest,
        width: texture.width,
        height: texture.height,
      }),
    dispose() {
      sprite.destroy();
      backdrop.destroy();

      if (svg) {
        texture.destroy();
      }
    },
  };
};

const openSpritesheet = async ({ scene, item, scope }: PreviewContext): Promise<Preview> => {
  const [texture, data] = await Promise.all([
    scope.load(assets[item.key] as typeof assets.platformerCharactersImage),
    scope.load(assets[item.atlasKey!] as typeof assets.platformerCharactersAtlas),
  ]);
  const sheet = new Spritesheet(texture, data as SpritesheetData);
  const names = [...sheet.frames.keys()];
  const animations = [...sheet.animations.keys()];
  const atlas = new Sprite(texture);
  const backdrop = checkerboard(texture.width, texture.height);
  const outlines = new Graphics();
  const strip = new Graphics();
  const frameLabel = new Text('', { fontSize: 15, fillColor: new Color(200, 214, 236) });
  const animationLabel = new Text('', { fontSize: 15, fillColor: new Color(200, 214, 236) });
  const animated = new AnimatedSprite(texture).setAnchor(0.5);
  const selectedSprite = new Sprite(texture).setAnchor(0.5);
  const STRIP_Y = PREVIEW.height - 208;
  const boxWidth = (PREVIEW.width - 36) / 2;
  const frameBox = { x: PREVIEW.x + 12, y: STRIP_Y, width: boxWidth, height: 196 };
  const animationBox = { x: frameBox.x + boxWidth + 12, y: STRIP_Y, width: boxWidth, height: 196 };
  const state = {
    animation: animations.length > 0 ? animations[0]! : 'Frame range',
    first: 0,
    last: Math.min(names.length - 1, 1),
    selected: 0,
    fps: 8,
    loop: true,
    scale: 1,
    bounds: true,
  };
  const clipFrames = (): string[] =>
    state.animation === 'Frame range'
      ? names.slice(Math.min(state.first, state.last), Math.max(state.first, state.last) + 1)
      : [...sheet.getAnimationFrameNames(state.animation)];

  const fitInBox = (sprite: Sprite, rect: Rectangle, box: typeof frameBox, scale: number): void => {
    // The two-line label takes the top 44 px of the box.
    const room = box.height - 52;

    sprite.setScale(Math.min(scale, room / rect.height)).setPosition(box.x + box.width / 2, box.y + 44 + (box.height - 44) / 2);
  };

  const redraw = (): void => {
    const range = new Set(clipFrames());

    outlines.clear();

    if (state.bounds) {
      for (const [name, rect] of sheet.frames) {
        const selected = names.indexOf(name) === state.selected;

        outlines.lineWidth = selected ? 3 : 1;
        outlines.lineColor = selected
          ? new Color(255, 214, 102)
          : range.has(name)
            ? new Color(127, 220, 160, 0.95)
            : new Color(127, 184, 255, 0.55);
        outlines.drawRectangle(rect.x, rect.y, rect.width, rect.height);
      }
    }

    const selectedName = names[state.selected]!;
    const selectedRect = sheet.getFrame(selectedName);

    selectedSprite.setTextureFrame(selectedRect);
    fitInBox(selectedSprite, selectedRect, frameBox, 4);
    frameLabel.text = `Frame ${state.selected + 1}/${names.length}
${selectedName}, ${selectedRect.width} x ${selectedRect.height}`;

    const frames = clipFrames().map(name => sheet.getFrame(name));

    animated.setClips({ preview: { frames, fps: state.fps, repeat: state.loop ? -1 : 1 } }).play('preview', { restart: true });
    fitInBox(animated, frames[0]!, animationBox, state.scale);
    animationLabel.text = `Animation: ${state.animation === 'Frame range' ? `frames ${Math.min(state.first, state.last) + 1}-${Math.max(state.first, state.last) + 1}` : state.animation}
${frames.length} frames, ${state.fps} fps${state.loop ? ', loop' : ''}`;
  };

  strip.fillColor = new Color(11, 16, 25, 0.94);
  strip.drawRectangle(PREVIEW.x, STRIP_Y - 12, PREVIEW.width, PREVIEW.height - STRIP_Y + 12);
  strip.fillColor = new Color(24, 30, 44);

  for (const box of [frameBox, animationBox]) {
    strip.drawRectangle(box.x, box.y, box.width, box.height);
  }

  frameLabel.setPosition(frameBox.x + 10, frameBox.y + 6);
  animationLabel.setPosition(animationBox.x + 10, animationBox.y + 6);
  redraw();

  return {
    world: [backdrop, atlas, outlines],
    overlay: [strip, selectedSprite, animated, frameLabel, animationLabel],
    // Fit the atlas into the area above the frame strip.
    bounds: { width: texture.width, height: texture.height * (PREVIEW.height / (STRIP_Y - 24)) },
    facts: [
      ['Atlas', `${texture.width} x ${texture.height} px`],
      ['Frames', String(names.length)],
      ['Animations', animations.length > 0 ? animations.join(', ') : 'none in the atlas data - pick a frame range'],
    ],
    mount(host) {
      const last = Math.max(0, names.length - 1);
      const frameName = (index: number): string => `#${Math.round(index) + 1}`;
      const controls = {
        zoom: zoomSlider(),
        animation: choice('Animation', ['Frame range', ...animations], state.animation),
        first: slider('First frame', { min: 0, max: last, step: 1, value: state.first, format: frameName }),
        last: slider('Last frame', { min: 0, max: last, step: 1, value: state.last, format: frameName }),
        fps: slider('FPS', { min: 1, max: 30, step: 1, value: state.fps, format: fps => `${fps}` }),
        loop: toggle('Loop', state.loop),
        scale: slider('Scale', { min: 0.25, max: 6, step: 0.25, value: state.scale, format: scale => `${scale}x` }),
        bounds: toggle('Frame bounds', state.bounds),
      };
      const handle = host({
        title: 'Spritesheet',
        controls,
        actions: {
          'Range from selected': () => handle.set('first', state.selected),
          'Range to selected': () => handle.set('last', state.selected),
          Fit: () => scene.fit(),
          Code: () => scene.showCode(),
          Data: () => void scene.showData(),
        },
        onChange(key, _value, values) {
          if (key === 'zoom') {
            scene.setZoom(values.zoom);

            return;
          }

          Object.assign(state, {
            animation: values.animation,
            first: values.first,
            last: values.last,
            fps: values.fps,
            loop: values.loop,
            scale: values.scale,
            bounds: values.bounds,
          });
          redraw();
        },
      });

      scene.bindZoom(handle);
      handle.status('Click a frame in the atlas to select it.');
    },
    update(delta) {
      animated.update(delta);
    },
    tap(x, y) {
      const index = names.findIndex(name => sheet.getFrame(name).contains(x, y));

      if (index >= 0) {
        state.selected = index;
        redraw();
        console.log(`Frame ${index + 1}: ${names[index]}`);
      }
    },
    snippet: () => spritesheetSnippet(item, { ...state, frames: clipFrames() }),
    data: () => Promise.resolve(data),
    dispose() {
      animated.destroy();
      selectedSprite.destroy();
      atlas.destroy();
      backdrop.destroy();
      outlines.destroy();
      strip.destroy();
      frameLabel.destroy();
      animationLabel.destroy();
      sheet.destroy();
    },
  };
};

const openMap = async ({ scene, item, scope }: PreviewContext): Promise<Preview> => {
  const source = assets[item.key].source;
  const ldtk = item.kind === 'ldtk';
  // Tileset images resolve relative to the map file, which is why the map
  // loads from the catalog's absolute URL through the format's own type.
  const world = ldtk ? await scope.load(Asset.type('ldtkMap', source)) : null;
  const levels: readonly TileMap[] = world ? world.levels : [await scope.load(Asset.type('tileMap', source))];
  const state = { level: 0, objects: true, zoom: 1, layers: new Map<string, boolean>() };
  const objects = new Graphics();
  let node: TileMapNode | null = null;
  const preview: Preview & { world: RenderNode[] } = {
    world: [],
    overlay: [],
    bounds: null,
    facts: [],
    mount(host) {
      const map = levels[state.level]!;
      const layerControls = Object.fromEntries(
        map.renderableLayers.map(layer => [`layer:${layer.name}`, toggle(`Layer ${layer.name}`, true)]),
      );
      const panel = host({
        title: ldtk ? 'LDtk world' : 'Tiled map',
        controls: {
          zoom: zoomSlider(),
          ...(levels.length > 1
            ? {
                level: choice(
                  'Level',
                  levels.map(level => level.name),
                ),
              }
            : {}),
          objects: toggle('Object shapes', state.objects),
          ...layerControls,
        },
        actions: { Fit: () => scene.fit(), Code: () => scene.showCode(), Data: () => void scene.showData() },
        onChange(key, value) {
          if (key === 'zoom') {
            state.zoom = value as number;
            scene.setZoom(value as number);
          } else if (key === 'level') {
            state.level = Math.max(
              0,
              levels.findIndex(level => level.name === value),
            );
            build();
            scene.fit();
          } else if (key === 'objects') {
            state.objects = value as boolean;
            objects.visible = state.objects;
          } else if (String(key).startsWith('layer:')) {
            const name = String(key).slice('layer:'.length);
            const layerNode = node?.getLayerNode(name);

            state.layers.set(name, value as boolean);

            if (layerNode) {
              layerNode.visible = value as boolean;
            }
          }
        },
      });

      scene.bindZoom(panel as unknown as { set(key: 'zoom', value: number): void });
    },
    snippet: () => mapSnippet(item, { level: levels[state.level]!.name, zoom: state.zoom, ldtk }),
    data: async () => scope.load(assets[item.key] as typeof assets.harborPlazaMap),
    dispose() {
      node?.destroy();
      objects.destroy();
    },
  };

  const build = (): void => {
    const map = levels[state.level]!;

    node?.destroy();
    node = new TileMapNode(map);
    objects.clear();
    objects.lineWidth = 2;
    objects.lineColor = new Color(255, 191, 82, 0.9);
    objects.fillColor = new Color(255, 191, 82, 0.16);

    let count = 0;

    for (const layer of map.objectLayers) {
      for (const object of layer.objects) {
        count += 1;

        if (object.kind === ObjectKind.Point) {
          objects.drawCircle(object.x, object.y, 6);
        } else if (object.kind === ObjectKind.Ellipse) {
          objects.drawEllipse(object.x + object.width / 2, object.y + object.height / 2, object.width / 2, object.height / 2);
        } else {
          objects.drawRectangle(object.x, object.y, object.width, object.height);
        }
      }
    }

    objects.visible = state.objects;
    preview.world.splice(0, preview.world.length, node, objects);
    Object.assign(preview, {
      bounds: { width: map.pixelWidth ?? (map.width ?? 0) * map.tileWidth, height: map.pixelHeight ?? (map.height ?? 0) * map.tileHeight },
      facts: [
        ['Format', ldtk ? 'LDtk world' : 'Tiled map'],
        ...(levels.length > 1 ? [['Levels', levels.map(level => level.name).join(', ')] as const] : []),
        ['Tiles', `${map.width ?? 'unbounded'} x ${map.height ?? 'unbounded'} at ${map.tileWidth} x ${map.tileHeight} px`],
        ['Layers', map.renderableLayers.map(layer => layer.name).join(', ') || 'none'],
        ['Objects', String(count)],
      ],
    });
  };

  build();

  return preview;
};

const openAudio = async ({ scene, item, scope, isCurrent }: PreviewContext): Promise<Preview> => {
  const descriptor = assets[item.key];
  const music = descriptor.type === 'music';
  // A sound sprite ships its clip table as JSON next to the audio file.
  const spriteTable = demoAssetCategories[item.key] === 'soundSprites' ? descriptor.source.replace(/\.[a-z0-9]+$/, '.json') : null;
  const [playable, table] = await Promise.all([
    music ? scope.load(descriptor as typeof assets.musicLoopMain) : scope.load(descriptor as typeof assets.soundUiClick),
    spriteTable ? scope.load(Asset.type<Record<string, { start: number; end: number }>>('json', spriteTable)) : Promise.resolve(null),
  ]);
  const clips = table ? Object.keys(table) : [];
  const audio = scene.app.audio;
  const state = { clip: clips[0] ?? '', volume: 0.8, loop: false };
  let voice: Voice | null = null;
  let pendingStart: (() => void) | null = null;
  let status: ((text: string) => void) | null = null;
  let reported = '';
  const waveform = new Graphics();
  const caption = new Text(music ? 'Streamed music has no decoded buffer to draw' : '', {
    fontSize: 18,
    fillColor: new Color(138, 160, 196),
  });
  const buffer = music ? null : (playable as Sound).audioBuffer;
  const channels = buffer?.numberOfChannels ?? 0;
  const channelNames = channels === 2 ? ['L', 'R'] : Array.from({ length: channels }, (_, channel) => String(channel + 1));
  const wave = { width: PREVIEW.width - 80, height: channels > 1 ? 300 : 220, gap: 16, left: PREVIEW.x + 40 };
  const lane = {
    height: (wave.height - wave.gap * Math.max(0, channels - 1)) / Math.max(1, channels),
    top: PREVIEW_CENTER.y - wave.height / 2,
  };
  const laneLabels =
    channels > 1
      ? channelNames.map((name, channel) =>
          new Text(name, { fontSize: 14, fontFamily: MONO, fillColor: new Color(138, 160, 196) })
            .setAnchor(1, 0.5)
            .setPosition(wave.left - 10, lane.top + channel * (lane.height + wave.gap) + lane.height / 2),
        )
      : [];

  // A decoded sound draws one lane per channel: a min/max bar per column, with
  // the selected sprite clip highlighted across all lanes.
  const drawWaveform = (): void => {
    waveform.clear();

    if (!buffer) {
      return;
    }

    const clip = table && state.clip ? table[state.clip] : undefined;

    if (clip) {
      waveform.fillColor = new Color(127, 184, 255, 0.16);
      waveform.drawRectangle(
        wave.left + (clip.start / buffer.duration) * wave.width,
        lane.top,
        ((clip.end - clip.start) / buffer.duration) * wave.width,
        wave.height,
      );
    }

    for (let channel = 0; channel < channels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      const middle = lane.top + channel * (lane.height + wave.gap) + lane.height / 2;
      const scale = lane.height / 2;

      waveform.fillColor = new Color(127, 184, 255, 0.25);
      waveform.drawRectangle(wave.left, middle - 0.5, wave.width, 1);
      waveform.fillColor = new Color(127, 184, 255);

      for (let column = 0; column < wave.width; column += 2) {
        const from = Math.floor((column / wave.width) * samples.length);
        const to = Math.max(from + 1, Math.floor(((column + 2) / wave.width) * samples.length));
        let low = 0;
        let high = 0;

        for (let index = from; index < to; index += 1) {
          low = Math.min(low, samples[index]!);
          high = Math.max(high, samples[index]!);
        }

        waveform.drawRectangle(wave.left + column, middle - high * scale, 1.5, Math.max(1, (high - low) * scale));
      }
    }
  };

  caption.setAnchor(0.5).setPosition(PREVIEW_CENTER.x, PREVIEW_CENTER.y);
  drawWaveform();

  const target = (): Sound | AudioStream => (clips.length > 0 ? (playable as Sound).sprite(state.clip) : playable);
  const pausable = (candidate: Voice | null): (Voice & { paused: boolean; pause(): void; resume(): void }) | null =>
    candidate && 'pause' in candidate && 'resume' in candidate
      ? (candidate as Voice & { paused: boolean; pause(): void; resume(): void })
      : null;

  const play = (): void => {
    const current = pausable(voice);

    if (current && !current.ended && current.paused) {
      current.resume();

      return;
    }

    if (pendingStart || (voice && !voice.ended)) {
      return;
    }

    // Runs once audio is usable - at once when it already is, after the
    // visitor's first gesture otherwise. Removed again by Stop and on switch,
    // so a start that is still waiting never plays for another selection.
    pendingStart = () => {
      pendingStart = null;

      if (!isCurrent()) {
        return;
      }

      voice = audio.play(target(), { volume: state.volume, loop: state.loop });
      console.log(`Playing ${item.name}${clips.length > 0 ? ` / ${state.clip}` : ''}`);
    };

    audio.onUnlock.add(pendingStart);

    if (audio.locked) {
      status?.('Waiting for the browser to allow audio...');
    }
  };

  const stop = (): void => {
    if (pendingStart) {
      audio.onUnlock.remove(pendingStart);
      pendingStart = null;
    }

    voice?.stop();
    voice = null;
  };

  return {
    world: [],
    overlay: [waveform, caption, ...laneLabels],
    bounds: null,
    facts: [
      ['Kind', music ? 'Music, streamed from an audio element' : 'Sound, decoded into memory'],
      ['Duration', formatSeconds(playable.duration)],
      ...(buffer ? [['Channels', channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : String(channels)] as const] : []),
      ...(clips.length > 0 ? [['Clips', clips.join(', ')] as const] : []),
    ],
    mount(host) {
      const panel = host({
        title: music ? 'Music' : 'Sound',
        controls: {
          ...(clips.length > 0 ? { clip: choice('Clip', clips) } : {}),
          volume: slider('Volume', { min: 0, max: 1, step: 0.05, value: state.volume, format: volume => `${Math.round(volume * 100)}%` }),
          loop: toggle('Loop', state.loop),
        },
        actions: {
          Play: play,
          Pause: () => {
            const current = pausable(voice);

            if (current && !current.ended) {
              current.pause();
            }
          },
          Stop: stop,
          Code: () => scene.showCode(),
        },
        onChange(key, value) {
          if (key === 'clip') {
            state.clip = value as string;
            stop();
            drawWaveform();
          } else if (key === 'volume') {
            state.volume = value as number;

            if (voice) {
              voice.volume = state.volume;
            }
          } else if (key === 'loop') {
            state.loop = value as boolean;
          }
        },
      });

      status = text => panel.status(text);
      panel.status('Press Play to listen.');
    },
    update() {
      const current = pausable(voice);
      const text = pendingStart
        ? audio.locked
          ? 'Waiting for the browser to allow audio...'
          : 'Starting...'
        : !voice || voice.ended
          ? 'Stopped'
          : current?.paused
            ? 'Paused'
            : 'Playing';

      if (text !== reported) {
        reported = text;
        status?.(text);
      }
    },
    snippet: () => audioSnippet(item, { ...state, music, clip: clips.length > 0 ? state.clip : null }),
    dispose() {
      stop();
      status = null;
      waveform.destroy();
      caption.destroy();
      laneLabels.forEach(label => label.destroy());
    },
  };
};

const openVideo = async ({ scene, item, scope, manifest, isCurrent }: PreviewContext): Promise<Preview> => {
  const video = await scope.load(assets[item.key] as typeof assets.videoDemoLoop);
  const element = video.videoElement;
  const meta = manifest?.media;
  const audio = scene.app.audio;
  const state = { muted: true, loop: true, rate: '1x' as '0.5x' | '1x' | '2x', zoom: 1 };
  let pendingStart: (() => void) | null = null;
  let panel: { set(key: 'position', value: number): void; status(text: string): void } | null = null;
  let syncing = false;
  let mounted = false;
  let since = 0;

  const play = (): void => {
    if (pendingStart || video.playing) {
      return;
    }

    // A muted video may start at once; one with sound waits for the gesture.
    if (video.muted) {
      video.play();
      console.log(`Playing ${item.name}`);

      return;
    }

    pendingStart = () => {
      pendingStart = null;

      if (isCurrent()) {
        video.play();
        console.log(`Playing ${item.name} with sound`);
      }
    };

    audio.onUnlock.add(pendingStart);
  };

  const cancelStart = (): void => {
    if (pendingStart) {
      audio.onUnlock.remove(pendingStart);
      pendingStart = null;
    }
  };

  const frameRate = meta?.video?.frameRate?.split('/').map(Number);

  return {
    world: [video],
    overlay: [],
    bounds: { width: video.width, height: video.height },
    facts: [
      ['Resolution', `${element.videoWidth} x ${element.videoHeight}`],
      ['Duration', formatSeconds(video.duration)],
      ...(meta?.container ? [['Container', meta.container] as const] : []),
      ...(meta?.video?.codec ? [['Video', [meta.video.codec, meta.video.profile].filter(Boolean).join(' ')] as const] : []),
      ...(frameRate && frameRate.length === 2
        ? [['Frame rate', `${(frameRate[0]! / frameRate[1]!).toFixed(2).replace(/\.00$/, '')} fps`] as const]
        : []),
      ...(meta?.video?.pixelFormat
        ? [['Pixels', `${meta.video.pixelFormat}${meta.video.bitDepth ? `, ${meta.video.bitDepth}-bit` : ''}`] as const]
        : []),
      ...(meta?.audio?.codec
        ? [['Audio', `${meta.audio.codec}, ${meta.audio.channels ?? '?'} ch`] as const]
        : ([['Audio', 'none']] as const)),
      // The file's dynamic range is metadata; the preview renders it through
      // the regular canvas pipeline either way.
      ...(meta?.dynamicRange ? [['Dynamic range', `${meta.dynamicRange} (file metadata)`] as const] : []),
    ],
    mount(host) {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const handle = host({
        title: 'Video',
        controls: {
          zoom: zoomSlider(),
          position: slider('Position', { min: 0, max: duration, step: duration / 200, value: 0, format: formatSeconds }),
          muted: toggle('Muted', state.muted),
          loop: toggle('Loop', state.loop),
          rate: choice('Speed', ['0.5x', '1x', '2x'] as const, state.rate),
        },
        actions: {
          Play: play,
          Pause: () => {
            cancelStart();
            video.pause();
          },
          Stop: () => {
            cancelStart();
            video.stop();
          },
          Fit: () => scene.fit(),
          Code: () => scene.showCode(),
        },
        onChange(key, value) {
          if (key === 'zoom') {
            state.zoom = value as number;
            scene.setZoom(value as number);
          } else if (key === 'position' && !syncing) {
            video.currentTime = value as number;
          } else if (key === 'muted') {
            state.muted = value as boolean;
            video.muted = state.muted;
          } else if (key === 'loop') {
            state.loop = value as boolean;
            video.loop = state.loop;
          } else if (key === 'rate') {
            state.rate = value as typeof state.rate;
            video.playbackRate = Number.parseFloat(state.rate);
          }
        },
      });

      panel = handle;
      mounted = true;
      video.applyOptions({ loop: state.loop, muted: state.muted });
      video.pause();
      scene.bindZoom(handle);
      handle.status('Press Play to start.');
    },
    update(delta) {
      since += delta;

      if (panel && since >= 0.25) {
        since = 0;
        syncing = true;
        panel.set('position', video.currentTime);
        syncing = false;
        panel.status(pendingStart ? 'Waiting for the browser to allow audio...' : video.playing ? 'Playing' : 'Paused');
      }
    },
    snippet: () => videoSnippet(item, state),
    dispose() {
      cancelStart();
      panel = null;

      // The video belongs to the scope and may be shared with a newer preview
      // of the same asset, so only a preview that was mounted pauses it.
      if (mounted) {
        video.pause();
      }
    },
  };
};

const measureContext = document.createElement('canvas').getContext('2d');

const measureWidth = (text: string, font: string): number => {
  if (!measureContext) {
    return text.length * 0.6 * Number.parseFloat(font);
  }

  measureContext.font = font;

  return measureContext.measureText(text).width;
};

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog';

const openFont = async ({ scene, item, scope }: PreviewContext): Promise<Preview> => {
  const descriptor = assets[item.key];
  const bitmap = descriptor.type === 'bmFont';
  const font: BmFont | null = bitmap ? await scope.load(descriptor as typeof assets.fontKenneyBlocksFnt) : null;
  const face: FontFace | null = bitmap ? null : await scope.load(descriptor as typeof assets.fontKenneyFuture);
  const family = face ? face.family.replaceAll('"', '') : '';
  const state = { text: SAMPLE_TEXT, size: 40, color: 'White' as 'White' | 'Gold' | 'Ink' };
  const colors = { White: Color.white, Gold: new Color(255, 214, 102), Ink: new Color(28, 32, 44) };
  const lines: Array<Text | BitmapText> = [];
  const preview: Preview & { overlay: RenderNode[] } = {
    world: [],
    overlay: [],
    bounds: null,
    facts: bitmap
      ? [['Kind', 'Bitmap font (.fnt with page textures)']]
      : [
          ['Family', family],
          ['Kind', 'Font face, registered with the document'],
        ],
    mount(host) {
      const panel = host({
        title: 'Font',
        controls: {
          size: slider('Size', { min: 10, max: 120, step: 2, value: state.size, format: size => `${size}px` }),
          color: choice('Colour', ['White', 'Gold', 'Ink'] as const),
        },
        actions: { Code: () => scene.showCode() },
        onChange(key, value) {
          if (key === 'size') {
            state.size = value as number;
          } else {
            state.color = value as typeof state.color;
            scene.setBackdrop(state.color === 'Ink' ? new Color(236, 239, 244) : new Color(32, 37, 50));
          }

          layout();
        },
      });
      const input = document.createElement('textarea');

      input.value = state.text;
      input.rows = 2;
      input.setAttribute('aria-label', 'Preview text');
      Object.assign(input.style, {
        width: '100%',
        boxSizing: 'border-box',
        marginTop: '8px',
        padding: '6px 8px',
        borderRadius: '8px',
        border: '1px solid rgba(154, 193, 255, 0.32)',
        background: 'rgba(154, 193, 255, 0.08)',
        color: 'inherit',
        font: `13px ${FONT}`,
        resize: 'vertical',
      });
      input.addEventListener('input', () => {
        state.text = input.value;
        layout();
      });
      input.addEventListener('change', () => console.log(`Preview text: "${input.value}"`));
      panel.element.append(input);
    },
    snippet: () => fontSnippet(item, { ...state, bitmap }),
    dispose() {
      for (const line of lines) {
        line.destroy();
      }
    },
  };

  const layout = (): void => {
    for (const line of lines.splice(0)) {
      line.destroy();
    }

    const sizes = [state.size, Math.round(state.size * 0.6), Math.round(state.size * 0.4)];
    let y = 60;

    for (const size of sizes) {
      const line = font
        ? new BitmapText(state.text, font).setScale(size / 32)
        : new Text(state.text, { fontFamily: family, fontSize: size, fillColor: colors[state.color], maxWidth: PREVIEW.width - 64 });
      // Text lays out lazily, so the number of wrapped lines is measured with
      // the same font on a scratch 2D context rather than read back.
      const wrapped = font ? 1 : Math.ceil(measureWidth(state.text, `${size}px "${family}"`) / (PREVIEW.width - 64)) + 0.2;

      line.setPosition(PREVIEW.x + 32, y);
      lines.push(line);
      y += wrapped * size * 1.3 + 28;
    }

    preview.overlay.splice(0, preview.overlay.length, ...lines);
  };

  layout();

  return preview;
};

const openData = async ({ scene, item, scope }: PreviewContext): Promise<Preview> => {
  const data: unknown = await scope.load(assets[item.key] as typeof assets.harborPlazaMap);

  return {
    world: [],
    overlay: [],
    bounds: null,
    facts: [['Kind', 'JSON document']],
    mount(host) {
      host({ title: 'Data', controls: {}, actions: { Data: () => void scene.showData(), Code: () => scene.showCode() } });
      void scene.showData();
    },
    snippet: () => dataSnippet(item),
    data: () => Promise.resolve(data),
    dispose() {
      // Nothing to release beyond the scope.
    },
  };
};

// --- Snippets ---------------------------------------------------------------
//
// Each snippet is a complete module: imports, one scene and the application,
// using only public ExoJS APIs and the demo catalog.

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const program = (imports: string[], body: string, options: { extensions?: string } = {}): string =>
  `${[...imports, "import { demoAssets as assets } from '@codexo/exojs-demo-assets';"].sort().join('\n')}

class PreviewScene extends Scene {
${body}
}

const app = new Application({
  scenes: { PreviewScene },
  canvas: { width: 1280, height: 720, mount: document.body },${options.extensions ? `\n  extensions: [${options.extensions}],` : ''}
});

await app.start(PreviewScene);
`;

const textureSnippet = (item: BrowserItem, state: { zoom: number; nearest: boolean; width: number; height: number }): string => {
  const svg = assets[item.key].type === 'svg';
  const scale = round(state.zoom);
  const names = [
    'Application',
    'Scene',
    'Sprite',
    ...(svg ? ['Texture'] : []),
    ...(state.nearest ? (svg ? ['ScaleModes'] : ['Asset', 'ScaleModes']) : []),
  ].sort();
  const load = svg
    ? `    // An SVG loads as an image; the texture over it is yours to destroy.
    const image = await this.loader.load(assets.${item.key});
    const texture = new Texture(image${state.nearest ? ', { scaleMode: ScaleModes.Nearest }' : ''});`
    : state.nearest
      ? `    // Sampling is part of the texture handle, chosen when it is loaded.
    const texture = await this.loader.load(
      Asset.type('texture', assets.${item.key}.source, { textureOptions: { scaleMode: ScaleModes.Nearest } }),
    );`
      : `    const texture = await this.loader.load(assets.${item.key});`;

  return program(
    [`import { ${names.join(', ')} } from '@codexo/exojs';`],
    `  override async load(): Promise<void> {
${load}
    const sprite = new Sprite(texture).setAnchor(0.5).setScale(${scale}).setPosition(640, 360);

    this.addChild(sprite);
  }`,
  );
};

const spritesheetSnippet = (
  item: BrowserItem,
  state: { animation: string; frames: string[]; fps: number; loop: boolean; scale: number },
): string => {
  const named = state.animation !== 'Frame range';
  const frames = named
    ? `sheet.getAnimationFrameNames(${JSON.stringify(state.animation)}).map(name => sheet.getFrame(name))`
    : `[${state.frames.map(name => JSON.stringify(name)).join(', ')}].map(name => sheet.getFrame(name))`;

  return program(
    ["import { AnimatedSprite, Application, Scene, Spritesheet } from '@codexo/exojs';"],
    `  override async load(): Promise<void> {
    const [texture, data] = await Promise.all([this.loader.load(assets.${item.key}), this.loader.load(assets.${item.atlasKey})]);
    const sheet = new Spritesheet(texture, data);
    const sprite = new AnimatedSprite(texture, {
      preview: { frames: ${frames}, fps: ${state.fps}, repeat: ${state.loop ? -1 : 1} },
    });

    sprite.setAnchor(0.5).setScale(${round(state.scale)}).setPosition(640, 360);
    this.addChild(sprite);
    sprite.play('preview');
  }`,
  );
};

const mapSnippet = (item: BrowserItem, state: { level: string; zoom: number; ldtk: boolean }): string =>
  state.ldtk
    ? program(
        [
          "import { Application, Asset, Scene } from '@codexo/exojs';",
          "import { TileMapNode } from '@codexo/exojs/tilemap';",
          "import { ldtkExtension } from '@codexo/exojs-ldtk';",
        ],
        `  override async load(): Promise<void> {
    // Tileset paths resolve against the world's URL, so load it from the catalog's absolute source.
    const world = await this.loader.load(Asset.type('ldtkMap', assets.${item.key}.source));
    const level = world.getLevelByName(${JSON.stringify(state.level)}) ?? world.levels[0]!;

    this.addChild(new TileMapNode(level).setScale(${round(state.zoom)}));
  }`,
        { extensions: 'ldtkExtension' },
      )
    : program(
        [
          "import { Application, Asset, Scene } from '@codexo/exojs';",
          "import { TileMapNode } from '@codexo/exojs/tilemap';",
          "import { tiledExtension } from '@codexo/exojs-tiled';",
        ],
        `  override async load(): Promise<void> {
    // Tileset images resolve against the map's URL, so load it from the catalog's absolute source.
    const map = await this.loader.load(Asset.type('tileMap', assets.${item.key}.source));

    this.addChild(new TileMapNode(map).setScale(${round(state.zoom)}));
  }`,
        { extensions: 'tiledExtension' },
      );

const audioSnippet = (item: BrowserItem, state: { music: boolean; clip: string | null; volume: number; loop: boolean }): string =>
  program(
    ["import { Application, Scene } from '@codexo/exojs';"],
    `  override async load(): Promise<void> {
    const ${state.music ? 'music' : 'sound'} = await this.loader.load(assets.${item.key});

    // Browsers keep audio locked until the first click or key press;
    // onUnlock runs the handler as soon as playback is allowed.
    this.app.audio.onUnlock.add(() => {
      this.app.audio.play(${state.music ? 'music' : state.clip ? `sound.sprite(${JSON.stringify(state.clip)})` : 'sound'}, { volume: ${round(state.volume)}, loop: ${state.loop} });
    });
  }`,
  );

const videoSnippet = (item: BrowserItem, state: { muted: boolean; loop: boolean; rate: string; zoom: number }): string =>
  program(
    ["import { Application, Scene } from '@codexo/exojs';"],
    `  override async load(): Promise<void> {
    const video = await this.loader.load(assets.${item.key});

    video.applyOptions({ loop: ${state.loop}, muted: ${state.muted}, playbackRate: ${Number.parseFloat(state.rate)} });
    video.setAnchor(0.5).setScale(${round(state.zoom)}).setPosition(640, 360);
    this.addChild(video);
${
  state.muted
    ? '    // A muted video may start without a user gesture.\n    video.play();'
    : '    // With sound, playback waits for the gesture that unlocks audio.\n    this.app.audio.onUnlock.add(() => video.play());'
}
  }`,
  );

const fontSnippet = (item: BrowserItem, state: { text: string; size: number; bitmap: boolean }): string =>
  state.bitmap
    ? program(
        ["import { Application, BitmapText, Scene } from '@codexo/exojs';"],
        `  override async load(): Promise<void> {
    const font = await this.loader.load(assets.${item.key});

    this.addChild(new BitmapText(${JSON.stringify(state.text)}, font).setScale(${round(state.size / 32)}).setPosition(40, 60));
  }`,
      )
    : program(
        ["import { Application, Color, Scene, Text } from '@codexo/exojs';"],
        `  override async load(): Promise<void> {
    // Loading a font registers its face with the document.
    const face = await this.loader.load(assets.${item.key});
    const text = new Text(${JSON.stringify(state.text)}, {
      fontFamily: face.family.replaceAll('"', ''),
      fontSize: ${state.size},
      fillColor: Color.white,
    });

    this.addChild(text.setPosition(40, 60));
  }`,
      );

const dataSnippet = (item: BrowserItem): string =>
  program(
    ["import { Application, Scene } from '@codexo/exojs';"],
    `  override async load(): Promise<void> {
    const data = await this.loader.load(assets.${item.key});

    console.log(Object.keys(data as object));
  }`,
  );

const app = new Application({
  scenes: { AssetBrowserScene },
  canvas: { width: STAGE.width, height: STAGE.height, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(32, 37, 50),
  extensions: [tiledExtension, ldtkExtension],
});

await app.start(AssetBrowserScene);
