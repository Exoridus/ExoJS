import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import type { Time } from '@/core/Time';
import { Graphics } from '@/rendering/primitives/Graphics';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { RenderNode } from '@/rendering/RenderNode';

import type { DebugLayerViewMode } from './DebugLayer';
import { DebugLayer } from './DebugLayer';

// ---------------------------------------------------------------------------
// HSL → RGB helper
// ---------------------------------------------------------------------------

/**
 * Convert HSL (hue 0-360, saturation 0-1, lightness 0-1) to a Color instance.
 * Returns an RGB Color (alpha = alpha parameter).
 */
function hslToColor(h: number, s: number, l: number, alpha: number): Color {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r: number;
  let g: number;
  let b: number;

  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return new Color(r + m, g + m, b + m, alpha);
}

// ---------------------------------------------------------------------------

/**
 * Debug layer that draws a bounding-box outline around every visible
 * RenderNode in the scene. Colours cycle by zIndex (HSL hue). World-space.
 */
export class BoundingBoxesLayer extends DebugLayer {
  private _graphics: Graphics | null = null;

  public constructor(app: Application) {
    super(app);
  }

  /** Renders in world-space so outlines align with scene node positions. */
  public override get viewMode(): DebugLayerViewMode {
    return 'world';
  }

  /** No per-frame pre-computation required; all state is derived in {@link render}. */
  public override update(_delta: Time): void {
    // State is built in render() each frame; nothing to pre-compute here.
  }

  /**
   * Walk the scene tree and draw a colored rectangle outline around every
   * visible node that has non-zero bounds. Outline hue cycles by `zIndex`
   * so overlapping nodes are visually distinguishable.
   */
  public override render(backend: RenderBackend): void {
    const root = this._app.sceneManager.scene?.root;

    if (!root) {
      return;
    }

    if (this._graphics === null) {
      this._graphics = new Graphics();
    }

    const gfx = this._graphics;

    gfx.clear();
    gfx.lineWidth = 1;

    this._walkNode(root, gfx);

    gfx.render(backend);
  }

  /** Release the internal {@link Graphics} primitive. */
  public override destroy(): void {
    if (this._graphics !== null) {
      this._graphics.destroy();
      this._graphics = null;
    }
  }

  // -----------------------------------------------------------------------

  private _walkNode(node: RenderNode, gfx: Graphics): void {
    if (!node.visible) {
      return;
    }

    const bounds = node.getBounds();

    // Skip zero-area bounds (defensive).
    if (bounds.width > 0 && bounds.height > 0) {
      const hue = (((node.zIndex * 30) % 360) + 360) % 360;
      const color = hslToColor(hue, 0.7, 0.5, 0.7);

      gfx.lineColor = color;

      // Draw the rectangle outline as four line segments.
      const l = bounds.left;
      const t = bounds.top;
      const r = bounds.right;
      const bo = bounds.bottom;

      gfx.moveTo(l, t);
      gfx.lineTo(r, t);
      gfx.lineTo(r, bo);
      gfx.lineTo(l, bo);
      gfx.lineTo(l, t);

      color.destroy();
    }

    // Recurse into Container children.
    const container = node as Partial<{ children: RenderNode[] }>;

    if (Array.isArray(container.children)) {
      for (const child of container.children) {
        this._walkNode(child, gfx);
      }
    }
  }
}
