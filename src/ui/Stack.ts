import type { RenderNode } from '#rendering/RenderNode';

import { Widget } from './Widget';

export type StackDirection = 'row' | 'column';

/** Where a stack places its children on the axis it does not flow along. */
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';

export interface StackOptions {
  /** Flow direction. Default `'column'`. */
  direction?: StackDirection;
  /** Gap between items in pixels. Default `8`. */
  spacing?: number;
  /** Inner padding around all items in pixels. Default `0`. */
  padding?: number;
  /** Cross-axis placement of the items. Default `'start'`. */
  align?: StackAlign;
}

/** The extents a child had before the stack grew or stretched it. */
interface NaturalSize {
  readonly main?: number;
  readonly cross?: number;
}

/**
 * Linear layout container that flows its children in a row or column with even
 * spacing and optional padding.
 *
 * The stack re-flows itself whenever anything it lays out changes: a child is
 * added, removed or reordered, a child widget resizes, or one of the layout
 * properties below is set. {@link Stack.layout} exists for the cases the
 * container cannot observe - a non-widget child whose drawn extent changed.
 *
 * A stack sizes itself to its content until {@link Stack.setSize} gives it an
 * explicit box. From then on it keeps that box, and the leftover space along
 * the flow direction is what {@link Stack.setGrow} distributes.
 */
export class Stack extends Widget {
  private _direction: StackDirection;
  private _spacing: number;
  private _padding: number;
  private _align: StackAlign;
  private readonly _grow = new WeakMap<RenderNode, number>();
  private readonly _natural = new WeakMap<RenderNode, NaturalSize>();
  private _explicitSize = false;
  private _flowing = false;

  public constructor(options: StackOptions = {}) {
    super();

    this._direction = options.direction ?? 'column';
    this._spacing = options.spacing ?? 8;
    this._padding = options.padding ?? 0;
    this._align = options.align ?? 'start';
  }

  /** Flow direction (`'row'` or `'column'`). */
  public get direction(): StackDirection {
    return this._direction;
  }

  public set direction(direction: StackDirection) {
    if (this._direction !== direction) {
      this._direction = direction;
      this.layout();
    }
  }

  /** Gap between items in pixels. */
  public get spacing(): number {
    return this._spacing;
  }

  public set spacing(spacing: number) {
    if (this._spacing !== spacing) {
      this._spacing = spacing;
      this.layout();
    }
  }

  /** Inner padding around all items in pixels. */
  public get padding(): number {
    return this._padding;
  }

  public set padding(padding: number) {
    if (this._padding !== padding) {
      this._padding = padding;
      this.layout();
    }
  }

  /**
   * Cross-axis placement of the items. `'stretch'` resizes widget children to
   * the full cross extent; leaving it restores the size they had before.
   */
  public get align(): StackAlign {
    return this._align;
  }

  public set align(align: StackAlign) {
    if (this._align !== align) {
      this._align = align;
      this.layout();
    }
  }

  /**
   * Give `child` a share of the leftover space along the flow direction,
   * proportional to `factor` against every other growing child. `0` drops the
   * share and restores the size the child had before it grew.
   *
   * Growing needs space to distribute, so it only applies once the stack has
   * an explicit size; a stack that sizes itself to its content has none.
   */
  public setGrow(child: RenderNode, factor: number): this {
    const grow = Math.max(0, factor);

    if (grow === 0) {
      this._grow.delete(child);
    } else {
      this._grow.set(child, grow);
    }

    return this.layout();
  }

  /** The grow factor `child` carries, or `0` when it does not grow. */
  public growOf(child: RenderNode): number {
    return this._grow.get(child) ?? 0;
  }

  /** Add a child; the stack re-flows on its own. */
  public addItem(child: RenderNode): this {
    this.addChild(child);

    return this;
  }

  /**
   * Give the stack an explicit box instead of sizing it to its content. This is
   * what makes {@link Stack.setGrow} effective, since growing needs leftover
   * space to hand out.
   */
  public override setSize(width: number, height: number): this {
    this._explicitSize = true;
    super.setSize(width, height);

    return this.layout();
  }

  /** Re-flow children along the stack direction. */
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
    const isRow = this._direction === 'row';
    const children = this.children;
    const stretching = this._align === 'stretch';
    const natural = new Map<RenderNode, { main: number; cross: number }>();

    let contentMain = 0;
    let contentCross = 0;
    let growTotal = 0;
    let first = true;

    for (const child of children) {
      const size = this._naturalSize(child);

      natural.set(child, size);
      contentMain += size.main + (first ? 0 : this._spacing);
      contentCross = Math.max(contentCross, size.cross);
      growTotal += this.growOf(child);
      first = false;
    }

    const innerMain = this._explicitSize ? Math.max(0, (isRow ? this._uiWidth : this._uiHeight) - this._padding * 2) : contentMain;
    const innerCross = this._explicitSize ? Math.max(0, (isRow ? this._uiHeight : this._uiWidth) - this._padding * 2) : contentCross;
    const leftover = growTotal > 0 ? Math.max(0, innerMain - contentMain) : 0;

    let main = this._padding;
    let leading = true;

    for (const child of children) {
      const size = natural.get(child) ?? this._naturalSize(child);
      const grow = this.growOf(child);
      const mainSize = size.main + (growTotal > 0 ? (leftover * grow) / growTotal : 0);
      const crossSize = stretching ? innerCross : size.cross;

      if (!leading) {
        main += this._spacing;
      }

      leading = false;

      this._applySize(child, size, mainSize, crossSize);
      child.setPosition(
        isRow ? main : this._padding + this._crossOffset(innerCross, crossSize),
        isRow ? this._padding + this._crossOffset(innerCross, crossSize) : main,
      );
      main += mainSize;
    }

    if (!this._explicitSize) {
      const along = contentMain + this._padding * 2;
      const across = contentCross + this._padding * 2;

      super.setSize(isRow ? along : across, isRow ? across : along);
    }
  }

  /** The cross-axis offset a child of `size` gets inside `available`. */
  private _crossOffset(available: number, size: number): number {
    if (this._align === 'center') {
      return (available - size) / 2;
    }

    if (this._align === 'end') {
      return available - size;
    }

    return 0;
  }

  /**
   * The extents a child would have without this stack: its own size, or the one
   * it had before the stack grew or stretched it. Measuring the imposed size
   * instead would make growing cumulative and dropping a grow factor a one-way
   * door.
   */
  private _naturalSize(child: RenderNode): { main: number; cross: number } {
    const isRow = this._direction === 'row';
    const size = this._measure(child);
    const imposed = this._natural.get(child);

    return {
      main: imposed?.main ?? (isRow ? size.width : size.height),
      cross: imposed?.cross ?? (isRow ? size.height : size.width),
    };
  }

  /** Size a widget child to its computed extents, recording what the stack replaced. */
  private _applySize(child: RenderNode, natural: { main: number; cross: number }, mainSize: number, crossSize: number): void {
    if (!(child instanceof Widget)) {
      return;
    }

    const isRow = this._direction === 'row';
    const grew = mainSize !== natural.main;
    const stretched = crossSize !== natural.cross;

    if (grew || stretched) {
      this._natural.set(child, { ...(grew && { main: natural.main }), ...(stretched && { cross: natural.cross }) });
    } else {
      this._natural.delete(child);
    }

    child.setSize(isRow ? mainSize : crossSize, isRow ? crossSize : mainSize);
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
