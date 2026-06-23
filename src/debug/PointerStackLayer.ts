import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { Time } from '#core/Time';
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
const panelH = 160;
const panelPad = 8;
const lineH = 14;
const textSize = 11;
const maxEntries = 10;

// Semi-transparent dark background.
const bgColor = new Color(0, 0, 0, 0.7);
const textColor = Color.white.clone();

// ---------------------------------------------------------------------------

/**
 * Debug layer that shows a screen-space panel (top-right corner) listing all
 * RenderNodes under the current pointer position, sorted by zIndex descending.
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
   * stack (up to 10 entries, sorted by zIndex descending).
   */
  public override update(_delta: Time): void {
    if (this._root === null) {
      this._build();
    }

    const canvas = this._app.canvas;
    const panelX = canvas.width - panelW - panelPad;
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

    // Pre-allocate enough Text nodes for header + entries.
    const totalLines = maxEntries + 2; // header row + cursor row + entries

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

    // The pointer x/y is canvas-relative. InteractionManager passes this
    // directly to node.contains(), so we do the same.
    const worldX = sx;
    const worldY = sy;

    const lines: string[] = [];

    lines.push(`Cursor: (${sx.toFixed(0)}, ${sy.toFixed(0)})`);
    lines.push('Stack (top→bottom):');

    // Collect all visible RenderNodes whose contains() returns true.
    const root = this._app.scene.currentScene?.root;
    const stack: RenderNode[] = [];

    if (root) {
      this._collectContaining(root, worldX, worldY, stack);
      stack.sort((a, b) => b.zIndex - a.zIndex);
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

  private _collectContaining(node: RenderNode, x: number, y: number, result: RenderNode[]): void {
    if (!node.visible) {
      return;
    }

    if (node.contains(x, y)) {
      result.push(node);
    }

    const container = node as Partial<{ children: RenderNode[] }>;

    if (Array.isArray(container.children)) {
      for (const child of container.children) {
        this._collectContaining(child, x, y, result);
      }
    }
  }
}
