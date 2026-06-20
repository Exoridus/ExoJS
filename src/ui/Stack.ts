import type { RenderNode } from '#rendering/RenderNode';

import { Widget } from './Widget';

export type StackDirection = 'row' | 'column';

export interface StackOptions {
  /** Flow direction. Default `'column'`. */
  direction?: StackDirection;
  /** Gap between items in pixels. Default `8`. */
  spacing?: number;
  /** Inner padding around all items in pixels. Default `0`. */
  padding?: number;
}

/**
 * Linear layout container that flows its children in a row or column with even
 * spacing and optional padding, then sizes itself to fit. Call
 * {@link Stack.layout} after mutating children added with `addChild`, or use
 * {@link Stack.addItem} to add and re-flow in one step.
 */
export class Stack extends Widget {
  private readonly _direction: StackDirection;
  private readonly _spacing: number;
  private readonly _padding: number;

  public constructor(options: StackOptions = {}) {
    super();

    this._direction = options.direction ?? 'column';
    this._spacing = options.spacing ?? 8;
    this._padding = options.padding ?? 0;
  }

  /** Add a child and re-flow the stack. */
  public addItem(child: RenderNode): this {
    this.addChild(child);

    return this.layout();
  }

  /** Re-flow children along the stack direction and resize to fit them. */
  public layout(): this {
    const isRow = this._direction === 'row';
    let main = this._padding;
    let crossMax = 0;
    let first = true;

    for (const child of this.children) {
      // Prefer a widget's explicit layout size; fall back to drawn bounds.
      const width = child instanceof Widget ? child.uiWidth : child.getLocalBounds().width;
      const height = child instanceof Widget ? child.uiHeight : child.getLocalBounds().height;

      if (!first) {
        main += this._spacing;
      }

      first = false;

      if (isRow) {
        child.setPosition(main, this._padding);
        main += width;
        crossMax = Math.max(crossMax, height);
      } else {
        child.setPosition(this._padding, main);
        main += height;
        crossMax = Math.max(crossMax, width);
      }
    }

    const along = main + this._padding;
    const cross = crossMax + this._padding * 2;

    this.setSize(isRow ? along : cross, isRow ? cross : along);

    return this;
  }
}
