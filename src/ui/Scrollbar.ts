import { Signal } from '#core/Signal';
import type { Stage } from '#core/Stage';
import type { InteractionEvent } from '#input/InteractionEvent';
import type { Pointer } from '#input/Pointer';
import { Vector } from '#math/Vector';

import { Widget } from './Widget';
import { WidgetBackground } from './WidgetBackground';

/** The axis a {@link Scrollbar} runs along. */
export type ScrollbarOrientation = 'vertical' | 'horizontal';

/** When a scrollbar is shown - see {@link ScrollContainer}. */
export type ScrollbarVisibility = 'auto' | 'always' | 'never';

/** Options for {@link Scrollbar}. */
export interface ScrollbarOptions {
  /** Axis the bar runs along. Default `'vertical'`. */
  orientation?: ScrollbarOrientation;
  /** Extent across the axis, in pixels. Default `12`. */
  thickness?: number;
  /** Smallest thumb extent in pixels, so a long content list keeps a grabbable thumb. Default `24`. */
  minThumbLength?: number;
}

/**
 * The draggable part of a {@link Scrollbar}. Its own widget because it paints a
 * different role in a different state than the track it sits on - a hovered
 * thumb on an unhovered track is the normal case.
 *
 * @internal
 */
class ScrollbarThumb extends Widget {
  private readonly _surface = new WidgetBackground(this, 0);
  private _pointerInside = false;
  private _pressed = false;

  public constructor() {
    super();

    this.interactive = true;
    this.cursor = 'pointer';
    this.onPointerOver.add(() => {
      this._pointerInside = true;
      this._refreshState();
    });
    this.onPointerOut.add(() => {
      this._pointerInside = false;
      this._refreshState();
    });
  }

  /** Paint the pressed state for the duration of a drag, wherever the pointer travels. */
  public setPressed(pressed: boolean): void {
    this._pressed = pressed;
    this._refreshState();
  }

  protected override _repaint(): void {
    this._surface.apply(this._skin('scrollbarThumb').background, this._uiWidth, this._uiHeight);
  }

  private _refreshState(): void {
    if (this._pressed) {
      this._setSkinState('pressed');
    } else {
      this._setSkinState(this._pointerInside ? 'hover' : 'normal');
    }
  }

  public override destroy(): void {
    this._surface.destroy();
    super.destroy();
  }
}

/**
 * Scroll position indicator with a draggable thumb, painting the
 * `scrollbarTrack` and `scrollbarThumb` roles of its inherited theme.
 *
 * A scrollbar reports a position rather than applying one: dragging the thumb
 * fires {@link Scrollbar.onScroll} with the new value and paints it, and the
 * owner decides what to scroll. {@link ScrollContainer} wires that up itself,
 * so a bar is only constructed directly to drive something else.
 *
 * The range comes from {@link Scrollbar.setRange}: how much is visible against
 * how much there is. The thumb's length is the ratio of the two, never shorter
 * than `minThumbLength`, and {@link Scrollbar.overflowing} is `false` while
 * everything fits.
 */
export class Scrollbar extends Widget {
  /** Fires with the offset a thumb drag arrived at, in content pixels. */
  public readonly onScroll = new Signal<[offset: number, scrollbar: Scrollbar]>();

  private readonly _track = new WidgetBackground(this, 0);
  private readonly _thumb = new ScrollbarThumb();
  private readonly _orientation: ScrollbarOrientation;
  private readonly _minThumbLength: number;
  private _thickness: number;
  private _viewportLength = 0;
  private _contentLength = 0;
  private _offset = 0;
  private _dragOrigin = 0;
  private _dragOffset = 0;
  private _dragging = false;
  /** Scratch vector reused while dragging - a pointer move must not allocate. */
  private readonly _localPoint = new Vector();

  private readonly _onGlobalPointerMove = (_pointer: Pointer, x: number, y: number): void => {
    this._trackDrag(x, y);
  };

  private readonly _onGlobalPointerUp = (): void => {
    this._endDrag();
  };

  public constructor(options: ScrollbarOptions = {}) {
    super();

    this._orientation = options.orientation ?? 'vertical';
    this._thickness = options.thickness ?? 12;
    this._minThumbLength = Math.max(1, options.minThumbLength ?? 24);

    this.interactive = true;
    this._thumb.visible = false;
    this.addChild(this._thumb);
    this._thumb.onPointerDown.add(this._onThumbDown);
  }

  /** The axis this bar runs along. Fixed at construction. */
  public get orientation(): ScrollbarOrientation {
    return this._orientation;
  }

  /** Extent across the axis, in pixels. */
  public get thickness(): number {
    return this._thickness;
  }

  public set thickness(value: number) {
    const thickness = Math.max(0, value);

    if (this._thickness !== thickness) {
      this._thickness = thickness;
      this.setLength(this.length);
    }
  }

  /** Extent along the axis, in pixels. */
  public get length(): number {
    return this._orientation === 'vertical' ? this._uiHeight : this._uiWidth;
  }

  /** Size the bar along its axis; the thickness fills the other one. */
  public setLength(length: number): this {
    return this._orientation === 'vertical' ? this.setSize(this._thickness, length) : this.setSize(length, this._thickness);
  }

  /** How much of the content is visible at once, in pixels. */
  public get viewportLength(): number {
    return this._viewportLength;
  }

  /** How much content there is along the axis, in pixels. */
  public get contentLength(): number {
    return this._contentLength;
  }

  /** The largest offset the content can be scrolled to; `0` while it fits. */
  public get maxOffset(): number {
    return Math.max(0, this._contentLength - this._viewportLength);
  }

  /** Whether the content exceeds the viewport, and so whether the bar has anything to show. */
  public get overflowing(): boolean {
    return this.maxOffset > 0;
  }

  /** Whether the thumb is being dragged right now. */
  public get dragging(): boolean {
    return this._dragging;
  }

  /** The node painting the track, or `null` while it paints nothing. */
  public get trackNode(): WidgetBackground['node'] {
    return this._track.node;
  }

  /** The widget painting the thumb. */
  public get thumbNode(): Widget {
    return this._thumb;
  }

  /** Declare how much of how much is visible; re-clamps the offset. */
  public setRange(viewportLength: number, contentLength: number): this {
    this._viewportLength = Math.max(0, viewportLength);
    this._contentLength = Math.max(0, contentLength);
    this._offset = Math.min(this._offset, this.maxOffset);
    this._layoutThumb();

    return this;
  }

  /** Current scroll offset in content pixels, clamped to `[0, maxOffset]`. */
  public get offset(): number {
    return this._offset;
  }

  public set offset(value: number) {
    const offset = Math.max(0, Math.min(value, this.maxOffset));

    if (this._offset !== offset) {
      this._offset = offset;
      this._layoutThumb();
    }
  }

  protected override _repaint(): void {
    this._track.apply(this._skin('scrollbarTrack').background, this._uiWidth, this._uiHeight);
  }

  protected override _relayout(): void {
    super._relayout();
    this._layoutThumb();
  }

  /** Size and place the thumb for the current range and position. */
  private _layoutThumb(): void {
    const vertical = this._orientation === 'vertical';
    const trackLength = vertical ? this._uiHeight : this._uiWidth;
    const thickness = vertical ? this._uiWidth : this._uiHeight;
    const maxOffset = this.maxOffset;

    if (trackLength <= 0 || maxOffset <= 0) {
      this._thumb.visible = false;

      return;
    }

    this._thumb.visible = true;

    const ratio = this._contentLength > 0 ? this._viewportLength / this._contentLength : 1;
    const thumbLength = Math.min(trackLength, Math.max(this._minThumbLength, trackLength * ratio));
    const travel = trackLength - thumbLength;
    const offset = travel * (this._offset / maxOffset);

    this._thumb.setSize(vertical ? thickness : thumbLength, vertical ? thumbLength : thickness);
    this._thumb.setPosition(vertical ? 0 : offset, vertical ? offset : 0);
  }

  /** The distance the thumb can travel along the track, in pixels; `0` when it fills it. */
  private _travel(): number {
    const vertical = this._orientation === 'vertical';

    return Math.max(0, (vertical ? this._uiHeight : this._uiWidth) - (vertical ? this._thumb.uiHeight : this._thumb.uiWidth));
  }

  private readonly _onThumbDown = (event: InteractionEvent): void => {
    if (!this.effectiveEnabled || this.maxOffset <= 0) {
      return;
    }

    event.stopPropagation();

    this._dragging = true;
    this._dragOffset = this._offset;
    this._dragOrigin = this._axisOf(event.x, event.y);
    this._thumb.setPressed(true);
    this._subscribeDrag(true);
  };

  /**
   * Follow the pointer for the current drag. The delta is taken in the bar's
   * own space, so a scaled UI layer drags at the rate the user sees rather than
   * at the rate the untransformed screen would suggest.
   */
  private _trackDrag(x: number, y: number): void {
    const travel = this._travel();

    if (travel <= 0) {
      return;
    }

    const delta = this._axisOf(x, y) - this._dragOrigin;
    const next = this._dragOffset + (delta / travel) * this.maxOffset;
    const clamped = Math.max(0, Math.min(next, this.maxOffset));

    if (clamped !== this._offset) {
      this._offset = clamped;
      this._layoutThumb();
      this.onScroll.dispatch(clamped, this);
    }
  }

  private _endDrag(): void {
    if (!this._dragging) {
      return;
    }

    this._dragging = false;
    this._thumb.setPressed(false);
    this._subscribeDrag(false);
  }

  /** The scroll-axis component of a screen point, in this bar's own space. */
  private _axisOf(x: number, y: number): number {
    const local = this._localPoint.set(x, y).transformInverse(this.getGlobalTransform());

    return this._orientation === 'vertical' ? local.y : local.x;
  }

  /**
   * A drag continues wherever the pointer goes, including outside the thumb and
   * outside the bar, so it follows the application's pointer signals rather than
   * the thumb's own - which stop the moment the pointer leaves it.
   */
  private _subscribeDrag(active: boolean): void {
    const input = this._stage?.app?.input;

    if (input === undefined) {
      return;
    }

    if (active) {
      input.onPointerMove.add(this._onGlobalPointerMove);
      input.onPointerUp.add(this._onGlobalPointerUp);
      input.onPointerCancel.add(this._onGlobalPointerUp);
    } else {
      input.onPointerMove.remove(this._onGlobalPointerMove);
      input.onPointerUp.remove(this._onGlobalPointerUp);
      input.onPointerCancel.remove(this._onGlobalPointerUp);
    }
  }

  /** @internal - a drag cannot outlive the tree the pointer signals came from. */
  public override _setStage(stage: Stage | null): void {
    if (this._dragging && this._stage?.app !== stage?.app) {
      this._endDrag();
    }

    super._setStage(stage);
  }

  public override destroy(): void {
    this._endDrag();
    this.onScroll.destroy();
    this._track.destroy();
    this._localPoint.destroy();
    super.destroy();
  }
}
