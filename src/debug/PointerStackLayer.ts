import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { Seconds } from '#core/units';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { Text as Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import type { DebugLayerViewMode } from './DebugLayer';
import { DebugLayer } from './DebugLayer';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const panelW = 260;
const panelPad = 8;
const lineH = 14;
const textSize = 11;
const maxEntries = 10;
// Cursor row, header row, the entries and the overflow row.
const totalLines = maxEntries + 3;
const panelH = panelPad * 2 + totalLines * lineH;

// Semi-transparent dark background.
const bgColor = new Color(0, 0, 0, 0.7);
const textColor = Color.white.clone();

// ---------------------------------------------------------------------------

/**
 * Debug layer that shows a screen-space panel (top-right corner) listing all
 * RenderNodes under the current pointer position, with UI before world nodes
 * and each layer sorted by zIndex descending.
 * Screen-space.
 */
export class PointerStackLayer extends DebugLayer {
  private _root: Container | null = null;
  private _bg: Graphics | null = null;
  private _lines: Text[] = [];

  public constructor(app: Application) {
    super(app);
  }

  /** Renders in screen-space so the panel stays fixed in the top-right corner. */
  public override get viewMode(): DebugLayerViewMode {
    return 'screen';
  }

  /**
   * Lazily initialize the panel on first call, reposition it to the
   * top-right corner, and populate text lines with the current pointer
   * stack (up to 10 entries, UI first and descending zIndex within each layer).
   */
  public override update(_delta: Seconds): void {
    if (this._root === null) {
      this._build();
    }

    const panelX = this._app.width - panelW - panelPad;
    const panelY = panelPad;

    // Position the panel.
    if (this._root !== null) {
      this._root.x = panelX;
      this._root.y = panelY;
    }

    // Collect stack info.
    const lines = this._buildLines();

    // Update text nodes.
    for (let i = 0; i < this._lines.length; i++) {
      const lineNode = this._lines[i];

      if (lineNode === undefined) {
        continue;
      }

      const line = lines[i];

      if (line !== undefined) {
        lineNode.text = line;
        lineNode.visible = true;
      } else {
        lineNode.text = '';
        lineNode.visible = false;
      }
    }
  }

  /** Submit the panel's {@link Container} subtree to the backend for drawing. */
  public override render(backend: RenderBackend): void {
    this._root?.render(backend);
  }

  /** Destroy the panel's {@link Container} subtree and release all child references. */
  public override destroy(): void {
    if (this._root !== null) {
      this._root.destroy();
      this._root = null;
    }

    this._bg = null;
    this._lines = [];
  }

  // -----------------------------------------------------------------------

  private _build(): void {
    const style: TextStyleOptions = {
      fontSize: textSize,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fillColor: textColor,
    };

    this._bg = new Graphics();
    this._bg.fillColor = bgColor;
    // Panel background will be repositioned in update(); draw at local (0,0).
    this._bg.drawRectangle(0, 0, panelW, panelH);

    this._root = new Container();
    this._root.addChild(this._bg);

    // Pre-allocate enough Text nodes for every row, including the overflow one.
    for (let i = 0; i < totalLines; i++) {
      const t = new Text('', style);

      t.x = panelPad;
      t.y = panelPad + i * lineH;
      t.visible = false;
      this._root.addChild(t);
      this._lines.push(t);
    }
  }

  private _buildLines(): string[] {
    const pos = this._app.input.getPrimaryPointerPosition();

    if (pos === null) {
      return ['Pointer: (none)'];
    }

    const { x: sx, y: sy } = pos;

    const lines: string[] = [];

    lines.push(`Cursor: (${sx.toFixed(0)}, ${sy.toFixed(0)})`);
    lines.push('Stack (top→bottom):');

    // Collect all visible RenderNodes whose contains() returns true.
    const scene = this._app.scenes.currentScene;
    const root = scene?.root;
    let stack: RenderNode[] = [];

    if (root) {
      const world = this._app.rendering.view.screenToWorld(sx, sy, this._app.width, this._app.height);

      this._collectContaining(root, world.x, world.y, stack);
      stack.sort((a, b) => b.zIndex - a.zIndex);
    }

    const uiRoot = scene?._peekUI();

    if (uiRoot) {
      const ui = this._app.rendering.screenView.screenToWorld(sx, sy, this._app.width, this._app.height);
      const uiStack: RenderNode[] = [];

      this._collectContaining(uiRoot, ui.x, ui.y, uiStack);
      uiStack.sort((a, b) => b.zIndex - a.zIndex);
      stack = [...uiStack, ...stack];
    }

    const shown = stack.slice(0, maxEntries);

    for (const node of shown) {
      const name = node.constructor.name;
      const z = node.zIndex;
      const inter = (node as { interactive?: boolean }).interactive ? ' — interactive' : '';

      lines.push(`  ${name} — z=${z}${inter}`);
    }

    if (stack.length > maxEntries) {
      lines.push(`  … +${stack.length - maxEntries} more`);
    }

    if (shown.length === 0) {
      lines.push('  (none)');
    }

    return lines;
  }

  /** Collect the visible nodes under the point in pre-order. */
  private _collectContaining(root: RenderNode, x: number, y: number, result: RenderNode[]): void {
    const slots: Array<RenderNode | null> = [];

    if (root.visible) {
      this._collectSubtree(root, x, y, slots);
    }

    for (const node of slots) {
      if (node !== null) {
        result.push(node);
      }
    }
  }

  /** Collect the visible subtree under the point into `slots` and return `node.contains(x, y)`. */
  private _collectSubtree(node: RenderNode, x: number, y: number, slots: Array<RenderNode | null>): boolean {
    const slot = slots.length;
    // A plain container hits wherever any child does, so its answer falls out of
    // the walk below; calling its contains() would walk the same subtree again.
    const derived = node instanceof Container && node.hitArea === null && node.contains === Container.prototype.contains;
    const container = node as Partial<{ children: RenderNode[] }>;
    let childHit = false;

    slots.push(node);

    if (Array.isArray(container.children)) {
      for (const child of container.children) {
        // A hidden child is not listed, but still counts towards its container's hit.
        const hit: boolean = child.visible ? this._collectSubtree(child, x, y, slots) : derived && !childHit && child.contains(x, y);

        childHit ||= hit;
      }
    }

    const hit = derived ? childHit : node.contains(x, y);

    if (!hit) {
      slots[slot] = null;
    }

    return hit;
  }
}
