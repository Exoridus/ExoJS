// Auto-generated from asset-browser.ts - edit the .ts source, not this file.
import {
  AnimatedSprite,
  Application,
  Asset,
  BitmapText,
  Color,
  Graphics,
  ManualCanvasSizing,
  ScaleModes,
  Scene,
  Sprite,
  Spritesheet,
  Text,
  Texture,
  View,
} from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs/audio-fx';
import { ObjectKind, TileMapNode } from '@codexo/exojs/tilemap';
import { demoAssetCategories, demoAssets as assets } from '@codexo/exojs-demo-assets';
import { ldtkExtension } from '@codexo/exojs-ldtk';
import { tiledExtension } from '@codexo/exojs-tiled';
import { choice, domDemoPanel as demoPanel, slider, toggle, unitsPerCssPixel } from '@examples/runtime';
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
const STAGE = { width: Math.max(960, window.innerWidth), height: Math.max(480, window.innerHeight) };
const SIDEBAR_WIDTH = 272;
const INSPECTOR_WIDTH = 332;
const PREVIEW = { x: SIDEBAR_WIDTH, y: 0, width: STAGE.width - SIDEBAR_WIDTH - INSPECTOR_WIDTH, height: STAGE.height - 104 };
const PREVIEW_CENTER = { x: PREVIEW.x + PREVIEW.width / 2, y: PREVIEW.height / 2 };
const FONT = '"Segoe UI", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const MANIFEST_URL = import.meta.resolve('@codexo/exojs-demo-assets/manifest.json');
const GROUP_OF = {
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
const GROUP_ORDER = ['Textures', 'Spritesheets', 'Maps', 'Audio', 'Video', 'Fonts', 'Data'];
const GROUP_GLYPH = {
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
const humanize = key => {
  const words = key
    .replace(/^(sound|music|font)(?=[A-Z])/, '')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const kindOf = key => {
  const descriptor = assets[key];
  switch (descriptor.type) {
    case 'texture':
    case 'svg':
    case 'sound':
    case 'music':
    case 'video':
    case 'font':
    case 'bmFont':
      return descriptor.type;
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
const buildItems = () => {
  const items = [];
  for (const key of Object.keys(demoAssetCategories)) {
    const base = key.replace(/(Atlas|Image)$/, '');
    const image = `${base}Image`;
    const atlas = `${base}Atlas`;
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
const fileName = source => decodeURIComponent(source.slice(source.lastIndexOf('/') + 1));
const formatBytes = bytes =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const formatSeconds = value => (Number.isFinite(value) ? `${value.toFixed(2)} s` : 'unknown');
const isAbort = error => error instanceof DOMException && error.name === 'AbortError';
class AssetBrowserScene extends Scene {
  sidebar = document.createElement('nav');
  search = document.createElement('input');
  tabs = document.createElement('div');
  list = document.createElement('ul');
  inspector = document.createElement('aside');
  transport = document.createElement('div');
  navigation = document.createElement('span');
  zoomReadout = document.createElement('output');
  heading = document.createElement('h2');
  facts = document.createElement('dl');
  panelSlot = document.createElement('div');
  resident = document.createElement('details');
  codePanel = document.createElement('section');
  codeTitle = document.createElement('strong');
  code = document.createElement('pre');
  buttons = new Map();
  view = new View(STAGE.width / 2, STAGE.height / 2, STAGE.width, STAGE.height);
  frame = new Graphics();
  message = new Text('', { fontSize: 22, fillColor: new Color(200, 214, 236), align: 'center' });
  backdrop = new Color(32, 37, 50);
  group = GROUPS[0];
  selected = null;
  generation = 0;
  scope = null;
  preview = null;
  panel = null;
  manifest = new Map();
  drag = null;
  zoomTarget = null;
  destroyed = false;
  async load() {
    // The package's manifest carries byte sizes and media metadata. It is
    // optional here: without it the inspector only shows what loading tells.
    try {
      const manifest = await this.loader.load(Asset.type('json', MANIFEST_URL));
      this.manifest = new Map(manifest.entries.map(entry => [entry.key, entry]));
    } catch (error) {
      console.warn('The demo asset manifest is unavailable; sizes and media details are hidden.', error);
    }
  }
  init() {
    this.mountSidebar();
    this.mountInspector();
    this.mountCodePanel();
    this.mountTransport();
    window.addEventListener('resize', this.resize);
    window.addEventListener('wheel', this.focusPreviewOnWheel, { capture: true, passive: true });
    this.resize();
    this.message.setAnchor(0.5).setPosition(PREVIEW_CENTER.x, PREVIEW_CENTER.y);
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onPointerUp.add(this.onPointerUp);
    this.app.input.onMouseWheel.add(this.onWheel);
    const requested = new URLSearchParams(window.location.search).get('asset');
    const initial = ITEMS.find(item => item.id === requested || item.key === requested || item.atlasKey === requested) ?? ITEMS[0];
    this.showGroup(initial.group);
    void this.select(initial);
  }
  // --- Selection ------------------------------------------------------------
  async select(item) {
    const generation = ++this.generation;
    this.closePreview();
    this.selected = item;
    this.markSelection();
    this.renderFacts(item, []);
    this.message.text = 'Loading...';
    const scope = this.loader.createScope({ name: `preview:${item.id}` });
    const started = performance.now();
    this.scope = scope;
    const context = {
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
  closePreview() {
    this.hideCode();
    this.panel?.dispose();
    this.panel = null;
    this.zoomTarget = null;
    for (const control of [...this.transport.children]) {
      if (control !== this.navigation) {
        control.remove();
      }
    }
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
  mountPanel(preview) {
    const host = options => {
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
      for (const label of ['Position', 'Volume']) {
        const input = panel.element.querySelector(`input[aria-label="${label}"]`);
        const row = input?.parentElement;
        if (row) {
          Object.assign(row.style, { flex: '1 1 150px', minWidth: '130px', margin: '0' });
          this.transport.insertBefore(row, this.navigation);
        }
      }
      for (const button of panel.element.querySelectorAll('button')) {
        if (['Play', 'Pause', 'Stop'].includes(button.textContent ?? '')) {
          Object.assign(button.style, { width: 'auto', margin: '0' });
          this.transport.insertBefore(button, this.navigation);
        }
      }
      this.addTransportActions();
      return panel;
    };
    preview.mount(host);
  }
  bindZoom(target) {
    this.zoomTarget = target;
  }
  setZoom(zoom, anchor = PREVIEW_CENTER) {
    const before = this.view.screenToWorld(anchor.x, anchor.y, STAGE.width, STAGE.height);
    this.view.setZoom(zoom);
    const after = this.view.screenToWorld(anchor.x, anchor.y, STAGE.width, STAGE.height);
    this.view.setCenter(this.view.center.x + before.x - after.x, this.view.center.y + before.y - after.y);
    this.zoomTarget?.(zoom);
    this.updateZoomReadout();
  }
  updateZoomReadout() {
    const scale = 1 / unitsPerCssPixel(this.app, this.app.canvas);
    this.zoomReadout.value = `${Math.round(this.view.zoomLevel * scale * 100)}%`;
  }
  mountTransport() {
    Object.assign(this.transport.style, {
      position: 'fixed',
      left: `${SIDEBAR_WIDTH}px`,
      right: `${INSPECTOR_WIDTH}px`,
      bottom: '0',
      height: '104px',
      overflowY: 'auto',
      boxSizing: 'border-box',
      padding: '10px',
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '8px',
      background: '#0b1019',
      color: '#dce8ff',
      font: `13px ${FONT}`,
      zIndex: '5',
    });
    this.transport.setAttribute('role', 'group');
    this.transport.setAttribute('aria-label', 'Preview controls');
    this.navigation.style.display = 'contents';
    for (const [label, direction] of [
      ['Previous', -1],
      ['Next', 1],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, chipStyle(false));
      button.addEventListener('click', () => this.stepAsset(direction));
      this.navigation.append(button);
    }
    this.transport.append(this.navigation);
    document.body.append(this.transport);
  }
  addTransportActions() {
    const actions = {
      ...(this.preview?.bounds ? { Fit: () => this.fit(), '1:1': () => this.setZoom(unitsPerCssPixel(this.app, this.app.canvas)) } : {}),
    };
    for (const [label, run] of Object.entries(actions)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, chipStyle(false));
      button.addEventListener('click', run);
      this.transport.append(button);
    }
    if (this.preview?.bounds) {
      this.transport.append(this.zoomReadout);
    }
    this.updateZoomReadout();
  }
  stepAsset(direction) {
    const items = this.visibleItems();
    const index = items.findIndex(item => item.id === this.selected?.id);
    const next = items[(index + direction + items.length) % items.length];
    if (next) {
      void this.select(next);
    }
  }
  resize = () => {
    const oldX = PREVIEW_CENTER.x;
    const oldY = PREVIEW_CENTER.y;
    const center = this.view.screenToWorld(oldX, oldY, STAGE.width, STAGE.height);
    STAGE.width = Math.max(960, window.innerWidth);
    STAGE.height = Math.max(480, window.innerHeight);
    PREVIEW.width = STAGE.width - SIDEBAR_WIDTH - INSPECTOR_WIDTH;
    PREVIEW.height = STAGE.height - 104;
    PREVIEW_CENTER.x = PREVIEW.x + PREVIEW.width / 2;
    PREVIEW_CENTER.y = PREVIEW.height / 2;
    this.app.resize(STAGE.width, STAGE.height);
    this.view.width = STAGE.width;
    this.view.height = STAGE.height;
    this.lookAt(center.x, center.y);
    if (this.preview?.resize) {
      this.preview.resize();
    } else {
      for (const node of this.preview?.overlay ?? []) {
        node.setPosition(node.x + PREVIEW_CENTER.x - oldX, node.y + PREVIEW_CENTER.y - oldY);
      }
    }
    this.codePanel.style.width = `${PREVIEW.width - 24}px`;
    this.message.setPosition(PREVIEW_CENTER.x, PREVIEW_CENTER.y);
    this.updateZoomReadout();
  };
  /** Puts world point (x, y) at the centre of the preview area. */
  lookAt(x, y) {
    const zoom = this.view.zoomLevel;
    this.view.setCenter(x - (PREVIEW_CENTER.x - STAGE.width / 2) / zoom, y - (PREVIEW_CENTER.y - STAGE.height / 2) / zoom);
  }
  fit() {
    const bounds = this.preview?.bounds;
    if (!bounds) {
      this.view.setZoom(1);
      this.lookAt(0, 0);
      return;
    }
    const bottomInset = this.preview?.bottomInset ?? 0;
    const zoom = Math.min(8, (PREVIEW.width * 0.9) / bounds.width, ((PREVIEW.height - bottomInset) * 0.82) / bounds.height);
    this.view.setZoom(zoom);
    this.lookAt(bounds.width / 2, bounds.height / 2 + bottomInset / (2 * zoom));
    this.zoomTarget?.(zoom);
    this.updateZoomReadout();
  }
  setBackdrop(color) {
    this.backdrop = color;
  }
  // --- Pointer: drag pans, wheel zooms, tap hits ----------------------------
  onPointerDown = (_pointer, x, y) => {
    if (x >= PREVIEW.x && x <= PREVIEW.x + PREVIEW.width && y >= 0 && y <= PREVIEW.height) {
      this.drag = { x, y, moved: false };
    }
  };
  onPointerMove = (_pointer, x, y) => {
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
  onPointerUp = (_pointer, x, y) => {
    const drag = this.drag;
    this.drag = null;
    if (drag && !drag.moved && this.preview?.tap) {
      // The four-argument form maps through the viewport at any zoom level;
      // the stage's design size stands in for the canvas size.
      const point = this.view.screenToWorld(x, y, STAGE.width, STAGE.height);
      this.preview.tap(point.x, point.y);
    }
  };
  focusPreviewOnWheel = event => {
    if (event.target === this.app.canvas) {
      this.app.canvas.focus({ preventScroll: true });
    }
  };
  onWheel = (_deltaX, deltaY) => {
    if (!this.preview?.bounds) {
      return;
    }
    const point = this.app.input.getPrimaryPointerPosition();
    if (!point || point.x < PREVIEW.x || point.x > PREVIEW.x + PREVIEW.width || point.y > PREVIEW.height) {
      return;
    }
    const zoom = Math.min(32, Math.max(0.05, this.view.zoomLevel * Math.exp(-deltaY * 0.0015)));
    this.setZoom(zoom, point);
  };
  // --- Frame ----------------------------------------------------------------
  update(delta) {
    this.preview?.update?.(delta);
  }
  draw(context) {
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
  destroy() {
    this.destroyed = true;
    this.generation += 1;
    this.closePreview();
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onPointerUp.remove(this.onPointerUp);
    this.app.input.onMouseWheel.remove(this.onWheel);
    this.sidebar.remove();
    this.inspector.remove();
    this.transport.remove();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('wheel', this.focusPreviewOnWheel, true);
    this.codePanel.remove();
    this.frame.destroy();
    this.message.destroy();
    this.view.destroy();
    super.destroy();
  }
  // --- Sidebar --------------------------------------------------------------
  mountSidebar() {
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
  showGroup(group) {
    this.group = group;
    this.search.value = '';
    for (const button of this.tabs.querySelectorAll('button')) {
      Object.assign(button.style, chipStyle(button.dataset.group === group));
      button.setAttribute('aria-pressed', String(button.dataset.group === group));
    }
    this.renderList();
  }
  visibleItems() {
    const query = this.search.value.trim().toLowerCase();
    return query
      ? ITEMS.filter(item => item.name.toLowerCase().includes(query) || item.key.toLowerCase().includes(query))
      : ITEMS.filter(item => item.group === this.group);
  }
  renderList() {
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
  markSelection() {
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
  mountInspector() {
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
  renderFacts(item, facts) {
    const manifest = this.manifest.get(item.key);
    const rows = [
      ['Asset', `assets.${item.key}`],
      ['File', fileName(assets[item.key].source)],
      ...(manifest ? [['Size', formatBytes(manifest.bytes + (item.atlasKey ? (this.manifest.get(item.atlasKey)?.bytes ?? 0) : 0))]] : []),
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
  renderResident() {
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
  mountCodePanel() {
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
    ]) {
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
        error => console.warn('The clipboard refused the copy:', error),
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
  showCode() {
    if (this.preview) {
      this.openCodePanel('Code', this.preview.snippet());
    }
  }
  async showData() {
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
  openCodePanel(title, text) {
    this.codeTitle.textContent = title;
    this.code.textContent = text;
    this.codePanel.style.display = 'flex';
  }
  hideCode() {
    this.codePanel.style.display = 'none';
  }
}
const chipStyle = active => ({
  padding: '4px 9px',
  border: `1px solid ${active ? 'rgba(127, 184, 255, 0.7)' : 'rgba(154, 193, 255, 0.28)'}`,
  borderRadius: '999px',
  background: active ? 'rgba(127, 184, 255, 0.24)' : 'transparent',
  color: active ? '#ffffff' : '#c4d2ec',
  font: `600 12px ${FONT}`,
  cursor: 'pointer',
});
// --- Previews ---------------------------------------------------------------
const openPreview = context => {
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
const BACKDROPS = { Checker: null, Dark: new Color(32, 37, 50), Light: new Color(236, 239, 244), Black: new Color(0, 0, 0) };
const BACKDROP_NAMES = Object.keys(BACKDROPS);
/** A transparency checkerboard behind a `width` x `height` image. */
const checkerboard = (width, height) => {
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
const openTexture = async ({ scene, item, scope }) => {
  const descriptor = assets[item.key];
  const svg = descriptor.type === 'svg';
  // An SVG loads as an image element; a texture over it is this preview's to destroy.
  const texture = svg
    ? new Texture(await scope.load(Asset.type('svg', descriptor.source, { width: 150, height: 150 })))
    : await scope.load(descriptor);
  const sprite = new Sprite(texture);
  const backdrop = checkerboard(texture.width, texture.height);
  const state = { zoom: 1, nearest: false, backdrop: 'Checker' };
  return {
    world: [backdrop, sprite],
    overlay: [],
    bounds: { width: texture.width, height: texture.height },
    facts: [
      ['Pixels', `${texture.width} x ${texture.height}`],
      ['Format', svg ? 'SVG, rasterized at the requested size' : (fileName(descriptor.source).split('.').pop() ?? '').toUpperCase()],
    ],
    mount(host) {
      host({
        title: 'Texture',
        controls: {
          filtering: choice('Filtering', ['Linear', 'Nearest']),
          backdrop: choice('Backdrop', BACKDROP_NAMES),
        },
        actions: { Code: () => scene.showCode() },
        onChange(key, _value, values) {
          state.nearest = values.filtering === 'Nearest';
          state.backdrop = values.backdrop;
          if (key === 'filtering') {
            // Sampling is per texture handle; this preview's scope owns this one.
            texture.scaleMode = state.nearest ? ScaleModes.Nearest : ScaleModes.Linear;
          } else if (key === 'backdrop') {
            backdrop.visible = values.backdrop === 'Checker';
            scene.setBackdrop(BACKDROPS[values.backdrop] ?? new Color(32, 37, 50));
          }
        },
      });
      scene.bindZoom(zoom => {
        state.zoom = zoom;
      });
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
const openSpritesheet = async ({ scene, item, scope }) => {
  const [texture, data] = await Promise.all([scope.load(assets[item.key]), scope.load(assets[item.atlasKey])]);
  const sheet = new Spritesheet(texture, data);
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
  const frameBox = { x: PREVIEW.x + 12, y: 0, width: 0, height: 196 };
  const animationBox = { ...frameBox };
  const state = {
    animation: animations.length > 0 ? animations[0] : 'Frame range',
    first: 0,
    last: Math.min(names.length - 1, 1),
    selected: 0,
    fps: 8,
    loop: true,
    scale: 1,
    bounds: true,
  };
  const clipFrames = () =>
    state.animation === 'Frame range'
      ? names.slice(Math.min(state.first, state.last), Math.max(state.first, state.last) + 1)
      : [...sheet.getAnimationFrameNames(state.animation)];
  const fitInBox = (sprite, rect, box, scale) => {
    // The two-line label takes the top 44 px of the box.
    const room = box.height - 52;
    sprite
      .setScale(Math.min(scale, (box.width - 20) / rect.width, room / rect.height))
      .setPosition(box.x + box.width / 2, box.y + 44 + (box.height - 44) / 2);
  };
  const layout = () => {
    frameBox.y = animationBox.y = PREVIEW.height - 208;
    frameBox.width = animationBox.width = (PREVIEW.width - 36) / 2;
    animationBox.x = frameBox.x + frameBox.width + 12;
    strip.clear();
    strip.fillColor = new Color(11, 16, 25, 0.94);
    strip.drawRectangle(PREVIEW.x, frameBox.y - 12, PREVIEW.width, 220);
    strip.fillColor = new Color(24, 30, 44);
    for (const box of [frameBox, animationBox]) {
      strip.drawRectangle(box.x, box.y, box.width, box.height);
    }
    for (const [label, box] of [
      [frameLabel, frameBox],
      [animationLabel, animationBox],
    ]) {
      label.setPosition(box.x + 10, box.y + 6);
      label.layout = { maxWidth: box.width - 20, maxLines: 2, overflow: 'ellipsis', ellipsis: '...' };
    }
    fitInBox(selectedSprite, selectedSprite.textureFrame, frameBox, 4);
    fitInBox(animated, animated.textureFrame, animationBox, state.scale);
  };
  const redraw = () => {
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
    const selectedName = names[state.selected];
    const selectedRect = sheet.getFrame(selectedName);
    selectedSprite.setTextureFrame(selectedRect);
    frameLabel.text = `Frame ${state.selected + 1}/${names.length}
${selectedName}, ${selectedRect.width} x ${selectedRect.height}`;
    const frames = clipFrames().map(name => sheet.getFrame(name));
    animated.setClips({ preview: { frames, fps: state.fps, repeat: state.loop ? -1 : 1 } }).play('preview', { restart: true });
    animationLabel.text = `Animation: ${state.animation === 'Frame range' ? `frames ${Math.min(state.first, state.last) + 1}-${Math.max(state.first, state.last) + 1}` : state.animation}
${frames.length} frames, ${state.fps} fps${state.loop ? ', loop' : ''}`;
    layout();
  };
  redraw();
  return {
    world: [backdrop, atlas, outlines],
    overlay: [strip, selectedSprite, animated, frameLabel, animationLabel],
    bounds: { width: texture.width, height: texture.height },
    bottomInset: 220,
    resize: layout,
    facts: [
      ['Atlas', `${texture.width} x ${texture.height} px`],
      ['Frames', String(names.length)],
      ['Animations', animations.length > 0 ? animations.join(', ') : 'none in the atlas data - pick a frame range'],
    ],
    mount(host) {
      const last = Math.max(0, names.length - 1);
      const frameName = index => `#${Math.round(index) + 1}`;
      const controls = {
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
          Code: () => scene.showCode(),
          Data: () => void scene.showData(),
        },
        onChange(key, _value, values) {
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
const openMap = async ({ scene, item, scope }) => {
  const source = assets[item.key].source;
  const ldtk = item.kind === 'ldtk';
  // Tileset images resolve relative to the map file, which is why the map
  // loads from the catalog's absolute URL through the format's own type.
  const world = ldtk ? await scope.load(Asset.type('ldtkMap', source)) : null;
  const levels = world ? world.levels : [await scope.load(Asset.type('tileMap', source))];
  const state = { level: 0, objects: true, zoom: 1, layers: new Map() };
  const objects = new Graphics();
  let node = null;
  const preview = {
    world: [],
    overlay: [],
    bounds: null,
    facts: [],
    mount(host) {
      const map = levels[state.level];
      const layerControls = Object.fromEntries(
        map.renderableLayers.map(layer => [`layer:${layer.name}`, toggle(`Layer ${layer.name}`, true)]),
      );
      host({
        title: ldtk ? 'LDtk world' : 'Tiled map',
        controls: {
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
        actions: { Code: () => scene.showCode(), Data: () => void scene.showData() },
        onChange(key, value) {
          if (key === 'level') {
            state.level = Math.max(
              0,
              levels.findIndex(level => level.name === value),
            );
            build();
            scene.fit();
          } else if (key === 'objects') {
            state.objects = value;
            objects.visible = state.objects;
          } else if (String(key).startsWith('layer:')) {
            const name = String(key).slice('layer:'.length);
            const layerNode = node?.getLayerNode(name);
            state.layers.set(name, value);
            if (layerNode) {
              layerNode.visible = value;
            }
          }
        },
      });
      scene.bindZoom(zoom => {
        state.zoom = zoom;
      });
    },
    snippet: () => mapSnippet(item, { level: levels[state.level].name, zoom: state.zoom, ldtk }),
    data: async () => scope.load(assets[item.key]),
    dispose() {
      node?.destroy();
      objects.destroy();
    },
  };
  const build = () => {
    const map = levels[state.level];
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
        ...(levels.length > 1 ? [['Levels', levels.map(level => level.name).join(', ')]] : []),
        ['Tiles', `${map.width ?? 'unbounded'} x ${map.height ?? 'unbounded'} at ${map.tileWidth} x ${map.tileHeight} px`],
        ['Layers', map.renderableLayers.map(layer => layer.name).join(', ') || 'none'],
        ['Objects', String(count)],
      ],
    });
  };
  build();
  return preview;
};
const openAudio = async ({ scene, item, scope, isCurrent }) => {
  const descriptor = assets[item.key];
  const music = descriptor.type === 'music';
  // A sound sprite ships its clip table as JSON next to the audio file.
  const spriteTable = demoAssetCategories[item.key] === 'soundSprites' ? descriptor.source.replace(/\.[a-z0-9]+$/, '.json') : null;
  const [playable, table] = await Promise.all([
    music ? scope.load(descriptor) : scope.load(descriptor),
    spriteTable ? scope.load(Asset.type('json', spriteTable)) : Promise.resolve(null),
  ]);
  const clips = table ? Object.keys(table) : [];
  const audio = scene.app.audio;
  const state = { clip: clips[0] ?? '', volume: 0.8, loop: false };
  let voice = null;
  let pendingStart = null;
  let status = null;
  let reported = '';
  let positionPanel = null;
  let syncingPosition = false;
  const waveform = new Graphics();
  const playhead = new Graphics();
  const live = new Graphics();
  const analyser = new AudioAnalyser();
  const bright = new Color(127, 184, 255);
  const dim = new Color(127, 184, 255, 0.25);
  const muted = new Color(138, 160, 196);
  const buffer = music ? null : playable.audioBuffer;
  const channels = buffer?.numberOfChannels ?? 0;
  const channelNames = channels === 2 ? ['L', 'R'] : Array.from({ length: channels }, (_, channel) => String(channel + 1));
  // A sound keeps its overview on top and the live signal in a strip below;
  // streamed music has no overview, so the live signal takes the middle.
  const scopeHeight = buffer ? 100 : 220;
  const waveformHeight = () => Math.min(channels > 1 ? 300 : 220, PREVIEW.height - 48 - scopeHeight - 32);
  const wave = { width: PREVIEW.width - 80, height: waveformHeight(), gap: 16, left: PREVIEW.x + 40 };
  const top = buffer ? PREVIEW_CENTER.y - (wave.height + 48 + scopeHeight) / 2 : PREVIEW_CENTER.y - scopeHeight / 2;
  const lane = { height: (wave.height - wave.gap * Math.max(0, channels - 1)) / Math.max(1, channels), top };
  const strip = { top: buffer ? top + wave.height + 48 : top, height: scopeHeight };
  const label = (text, y) =>
    new Text(text, { fontSize: 14, fontFamily: MONO, fillColor: muted }).setAnchor(1, 0.5).setPosition(wave.left - 10, y);
  const labels = [
    ...(channels > 1
      ? channelNames.map((name, channel) => label(name, lane.top + channel * (lane.height + wave.gap) + lane.height / 2))
      : []),
    ...(buffer
      ? [
          new Text('Live signal', { fontSize: 14, fontFamily: MONO, fillColor: muted })
            .setAnchor(0, 1)
            .setPosition(wave.left, strip.top - 8),
        ]
      : []),
  ];
  const caption = new Text(music ? 'Press Play to see the live signal' : '', { fontSize: 18, fillColor: muted });
  // A decoded sound draws one lane per channel: a min/max bar per column, with
  // the selected sprite clip highlighted across all lanes.
  const drawWaveform = () => {
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
      waveform.fillColor = dim;
      waveform.drawRectangle(wave.left, middle - 0.5, wave.width, 1);
      waveform.fillColor = bright;
      for (let column = 0; column < wave.width; column += 2) {
        const from = Math.floor((column / wave.width) * samples.length);
        const to = Math.max(from + 1, Math.floor(((column + 2) / wave.width) * samples.length));
        let low = 0;
        let high = 0;
        for (let index = from; index < to; index += 1) {
          low = Math.min(low, samples[index]);
          high = Math.max(high, samples[index]);
        }
        waveform.drawRectangle(wave.left + column, middle - high * scale, 1.5, Math.max(1, (high - low) * scale));
      }
    }
  };
  // The analyser's window is the last few milliseconds the voice produced,
  // down-mixed to one channel - an oscilloscope, not a second overview.
  const drawLive = signal => {
    const middle = strip.top + strip.height / 2;
    const scale = strip.height / 2;
    live.clear();
    live.fillColor = dim;
    live.drawRectangle(wave.left, middle - 0.5, wave.width, 1);
    if (!signal) {
      return;
    }
    live.fillColor = bright;
    for (let column = 0; column < wave.width; column += 2) {
      const from = Math.floor((column / wave.width) * signal.length);
      const to = Math.max(from + 1, Math.floor(((column + 2) / wave.width) * signal.length));
      let low = 0;
      let high = 0;
      for (let index = from; index < to; index += 1) {
        low = Math.min(low, signal[index]);
        high = Math.max(high, signal[index]);
      }
      live.drawRectangle(wave.left + column, middle - high * scale, 1.5, Math.max(1, (high - low) * scale));
    }
  };
  const drawPlayhead = () => {
    playhead.clear();
    if (!buffer || !voice || voice.ended || !('time' in voice)) {
      return;
    }
    // A sprite voice reports its time from the start of its clip.
    const offset = table && state.clip ? (table[state.clip]?.start ?? 0) : 0;
    const x = wave.left + ((offset + voice.time) / buffer.duration) * wave.width;
    playhead.fillColor = Color.white;
    playhead.drawRectangle(x - 0.75, lane.top, 1.5, wave.height);
  };
  caption.setAnchor(0.5).setPosition(PREVIEW_CENTER.x, strip.top + strip.height + 40);
  drawWaveform();
  drawLive(null);
  const target = () => (clips.length > 0 ? playable.sprite(state.clip) : playable);
  const pausable = candidate => (candidate && 'pause' in candidate && 'resume' in candidate ? candidate : null);
  const play = () => {
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
      analyser.source = voice;
      console.log(`Playing ${item.name}${clips.length > 0 ? ` / ${state.clip}` : ''}`);
    };
    audio.onUnlock.add(pendingStart);
    if (audio.locked) {
      status?.('Waiting for the browser to allow audio...');
    }
  };
  const stop = () => {
    if (pendingStart) {
      audio.onUnlock.remove(pendingStart);
      pendingStart = null;
    }
    voice?.stop();
    voice = null;
    analyser.source = null;
  };
  return {
    world: [],
    overlay: [waveform, playhead, live, caption, ...labels],
    bounds: null,
    facts: [
      ['Kind', music ? 'Music, streamed from an audio element' : 'Sound, decoded into memory'],
      ['Duration', formatSeconds(playable.duration)],
      ...(buffer ? [['Channels', channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : String(channels)]] : []),
      ...(clips.length > 0 ? [['Clips', clips.join(', ')]] : []),
    ],
    mount(host) {
      const panel = host({
        title: music ? 'Music' : 'Sound',
        controls: {
          ...(clips.length > 0 ? { clip: choice('Clip', clips) } : {}),
          position: slider('Position', { min: 0, max: 100, step: 0.1, value: 0, format: position => `${position.toFixed(0)}%` }),
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
            state.clip = value;
            stop();
            drawWaveform();
          } else if (key === 'position' && !syncingPosition && voice && 'time' in voice) {
            voice.time = (target().duration * value) / 100;
          } else if (key === 'volume') {
            state.volume = value;
            if (voice) {
              voice.volume = state.volume;
            }
          } else if (key === 'loop') {
            state.loop = value;
          }
        },
      });
      positionPanel = panel;
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
      const playing = text === 'Playing' || text === 'Paused';
      caption.visible = !playing;
      drawLive(playing ? analyser.getWaveformFloat() : null);
      drawPlayhead();
      if (positionPanel && voice && 'time' in voice && target().duration > 0) {
        syncingPosition = true;
        positionPanel.set('position', (voice.time / target().duration) * 100);
        syncingPosition = false;
      }
    },
    resize() {
      wave.width = PREVIEW.width - 80;
      wave.left = PREVIEW.x + 40;
      wave.height = waveformHeight();
      lane.height = (wave.height - wave.gap * Math.max(0, channels - 1)) / Math.max(1, channels);
      lane.top = buffer ? PREVIEW_CENTER.y - (wave.height + 48 + scopeHeight) / 2 : PREVIEW_CENTER.y - scopeHeight / 2;
      strip.top = buffer ? lane.top + wave.height + 48 : lane.top;
      labels.forEach((label, index) => {
        const channel = channels > 1 && index < channelNames.length;
        label.setPosition(
          channel ? wave.left - 10 : wave.left,
          channel ? lane.top + index * (lane.height + wave.gap) + lane.height / 2 : strip.top - 8,
        );
      });
      caption.setPosition(PREVIEW_CENTER.x, strip.top + strip.height + 40);
      drawWaveform();
    },
    snippet: () => audioSnippet(item, { ...state, music, clip: clips.length > 0 ? state.clip : null }),
    dispose() {
      stop();
      status = null;
      positionPanel = null;
      analyser.destroy();
      waveform.destroy();
      playhead.destroy();
      live.destroy();
      caption.destroy();
      labels.forEach(text => text.destroy());
    },
  };
};
const openVideo = async ({ scene, item, scope, manifest, isCurrent }) => {
  const video = await scope.load(assets[item.key]);
  const element = video.videoElement;
  const meta = manifest?.media;
  const audio = scene.app.audio;
  const state = { muted: true, loop: true, rate: '1x', zoom: 1 };
  let pendingStart = null;
  let panel = null;
  let syncing = false;
  let mounted = false;
  let since = 0;
  const play = () => {
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
  const cancelStart = () => {
    if (pendingStart) {
      audio.onUnlock.remove(pendingStart);
      pendingStart = null;
    }
  };
  const frameRate = meta?.video?.frameRate?.split('/').map(Number);
  const fps = frameRate?.length === 2 && frameRate.every(part => Number.isFinite(part) && part > 0) ? frameRate[0] / frameRate[1] : NaN;
  return {
    world: [video],
    overlay: [],
    bounds: { width: video.width, height: video.height },
    facts: [
      ['Resolution', `${element.videoWidth} x ${element.videoHeight}`],
      ['Duration', formatSeconds(video.duration)],
      ...(meta?.container ? [['Container', meta.container]] : []),
      ...(meta?.video?.codec ? [['Video', [meta.video.codec, meta.video.profile].filter(Boolean).join(' ')]] : []),
      ...(Number.isFinite(fps) && fps > 0 ? [['Frame rate', `${fps.toFixed(2).replace(/\.00$/, '')} fps`]] : []),
      ...(meta?.video?.pixelFormat
        ? [['Pixels', `${meta.video.pixelFormat}${meta.video.bitDepth ? `, ${meta.video.bitDepth}-bit` : ''}`]]
        : []),
      ...(meta?.audio?.codec ? [['Audio', `${meta.audio.codec}${meta.audio.channels ? `, ${meta.audio.channels} ch` : ''}`]] : []),
      // The file's dynamic range is metadata; the preview renders it through
      // the regular canvas pipeline either way.
      ...(meta?.dynamicRange ? [['Dynamic range', `${meta.dynamicRange} (file metadata)`]] : []),
    ],
    mount(host) {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const handle = host({
        title: 'Video',
        controls: {
          position: slider('Position', { min: 0, max: duration, step: duration / 200, value: 0, format: formatSeconds }),
          muted: toggle('Muted', state.muted),
          loop: toggle('Loop', state.loop),
          rate: choice('Speed', ['0.5x', '1x', '2x'], state.rate),
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
          Code: () => scene.showCode(),
        },
        onChange(key, value) {
          if (key === 'position' && !syncing) {
            video.currentTime = value;
          } else if (key === 'muted') {
            state.muted = value;
            video.muted = state.muted;
          } else if (key === 'loop') {
            state.loop = value;
            video.loop = state.loop;
          } else if (key === 'rate') {
            state.rate = value;
            video.playbackRate = Number.parseFloat(state.rate);
          }
        },
      });
      panel = handle;
      mounted = true;
      video.applyOptions({ loop: state.loop, muted: state.muted });
      video.pause();
      scene.bindZoom(zoom => {
        state.zoom = zoom;
      });
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
const measureWidth = (text, font) => {
  if (!measureContext) {
    return text.length * 0.6 * Number.parseFloat(font);
  }
  measureContext.font = font;
  return measureContext.measureText(text).width;
};
const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog';
const openFont = async ({ scene, item, scope }) => {
  const descriptor = assets[item.key];
  const bitmap = descriptor.type === 'bmFont';
  const font = bitmap ? await scope.load(descriptor) : null;
  const face = bitmap ? null : await scope.load(descriptor);
  const family = face ? face.family.replaceAll('"', '') : '';
  const state = { text: SAMPLE_TEXT, size: 40, color: 'White' };
  const colors = { White: Color.white, Gold: new Color(255, 214, 102), Ink: new Color(28, 32, 44) };
  const lines = [];
  const preview = {
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
          color: choice('Colour', ['White', 'Gold', 'Ink']),
        },
        actions: { Code: () => scene.showCode() },
        onChange(key, value) {
          if (key === 'size') {
            state.size = value;
          } else {
            state.color = value;
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
    resize: () => layout(),
    snippet: () => fontSnippet(item, { ...state, bitmap }),
    dispose() {
      for (const line of lines) {
        line.destroy();
      }
    },
  };
  const layout = () => {
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
const openData = async ({ scene, item, scope }) => {
  const data = await scope.load(assets[item.key]);
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
const round = (value, digits = 2) => Number(value.toFixed(digits));
const program = (
  imports,
  body,
  options = {},
) => `${[...imports, "import { demoAssets as assets } from '@codexo/exojs-demo-assets';"].sort().join('\n')}

class PreviewScene extends Scene {
${body}
}

const app = new Application({
  scenes: { PreviewScene },
  canvas: { width: 1280, height: 720, mount: document.body },${options.extensions ? `\n  extensions: [${options.extensions}],` : ''}
});

await app.start(PreviewScene);
`;
const textureSnippet = (item, state) => {
  const svg = assets[item.key].type === 'svg';
  const scale = round(state.zoom);
  const names = [
    'Application',
    'Scene',
    'Sprite',
    ...(svg ? ['Asset', 'Texture'] : []),
    ...(state.nearest ? (svg ? ['ScaleModes'] : ['Asset', 'ScaleModes']) : []),
  ].sort();
  const load = svg
    ? `    // An SVG loads as an image; the texture over it is yours to destroy.
    const image = await this.loader.load(Asset.type('svg', assets.${item.key}.source, { width: ${state.width}, height: ${state.height} }));
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
const spritesheetSnippet = (item, state) => {
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
const mapSnippet = (item, state) =>
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
const audioSnippet = (item, state) =>
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
const videoSnippet = (item, state) =>
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
const fontSnippet = (item, state) =>
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
const dataSnippet = item =>
  program(
    ["import { Application, Scene } from '@codexo/exojs';"],
    `  override async load(): Promise<void> {
    const data = await this.loader.load(assets.${item.key});

    console.log(Object.keys(data as object));
  }`,
  );
const app = new Application({
  scenes: { AssetBrowserScene },
  canvas: { width: STAGE.width, height: STAGE.height, mount: document.body, sizing: new ManualCanvasSizing() },
  clearColor: new Color(32, 37, 50),
  extensions: [tiledExtension, ldtkExtension],
});
Object.assign(app.canvas.style, { width: '100%', height: '100%', display: 'block' });
await app.start(AssetBrowserScene);
