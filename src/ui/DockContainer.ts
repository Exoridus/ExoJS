import type { RenderNode } from '#rendering/RenderNode';

import { Widget } from './Widget';

/** Where a {@link DockContainer} places a child. */
export type DockRegion = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface DockContainerOptions {
  width?: number;
  height?: number;
}

/**
 * Layout container that pins children to the edges of its box and gives the
 * remaining space to the centre.
 *
 * Each edge child is sized across the band it docks to - a `'top'` child spans
 * the width that is still free, a `'left'` child the height - and keeps its own
 * extent along the other axis. Bands are taken in the order the children were
 * docked, so docking `'top'` before `'left'` gives the top band the full width
 * and the left band what is left below it.
 *
 * The container re-flows itself whenever a child is added, removed, reordered
 * or resized, and whenever the container is resized.
 */
export class DockContainer extends Widget {
  private readonly _regions = new WeakMap<RenderNode, DockRegion>();
  private _flowing = false;

  public constructor(options: DockContainerOptions = {}) {
    super();

    this.setSize(options.width ?? 0, options.height ?? 0);
  }

  /** Add `child` (if it is not already here) and dock it in `region`. */
  public dock(child: RenderNode, region: DockRegion): this {
    this._regions.set(child, region);
    this.addChild(child);

    return this.layout();
  }

  /**
   * The region `child` is laid out in, or `null` when it is not a child of this
   * container. A child added without {@link DockContainer.dock} takes the
   * centre.
   */
  public regionOf(child: RenderNode): DockRegion | null {
    return child.parent === this ? (this._regions.get(child) ?? 'center') : null;
  }

  /** Re-place children in their regions. */
  public layout(): this {
    if (this._flowing) {
      return this;
    }

    this._flowing = true;

    try {
      this._flow();
    } finally {
      this._flowing = false;
    }

    return this;
  }

  protected override _onChildListChanged(): void {
    this.layout();
  }

  protected override _onChildResized(): void {
    this.layout();
  }

  protected override _relayout(): void {
    super._relayout();
    this.layout();
  }

  private _flow(): void {
    const centred = new Array<RenderNode>();

    let x = 0;
    let y = 0;
    let width = this._uiWidth;
    let height = this._uiHeight;

    for (const child of this.children) {
      const region = this._regions.get(child) ?? 'center';

      if (region === 'center') {
        centred.push(child);

        continue;
      }

      const size = this._measure(child);

      if (region === 'top' || region === 'bottom') {
        const band = Math.min(size.height, height);
        const top = region === 'top' ? y : y + height - band;

        child.setPosition(x, top);
        this._resize(child, width, band);

        if (region === 'top') {
          y += band;
        }

        height -= band;
      } else {
        const band = Math.min(size.width, width);
        const left = region === 'left' ? x : x + width - band;

        child.setPosition(left, y);
        this._resize(child, band, height);

        if (region === 'left') {
          x += band;
        }

        width -= band;
      }
    }

    for (const child of centred) {
      child.setPosition(x, y);
      this._resize(child, width, height);
    }
  }

  /** Size a widget child; a plain node keeps whatever extent it draws. */
  private _resize(child: RenderNode, width: number, height: number): void {
    if (child instanceof Widget) {
      child.setSize(width, height);
    }
  }

  /** A child's layout extent: a widget's explicit size, or a drawn node's bounds. */
  private _measure(child: RenderNode): { width: number; height: number } {
    if (child instanceof Widget) {
      return { width: child.uiWidth, height: child.uiHeight };
    }

    const bounds = child.getLocalBounds();

    return { width: bounds.width, height: bounds.height };
  }
}
