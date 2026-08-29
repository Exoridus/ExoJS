import { Signal } from '#core/Signal';
import type { Stage } from '#core/Stage';
import type { InteractionEvent } from '#input/InteractionEvent';
import type { KeyEvent } from '#input/KeyEvent';
import type { Pointer } from '#input/Pointer';
import { Keyboard } from '#input/types';
import { clamp } from '#math/utils';
import { Vector } from '#math/Vector';

import type { UIWidgetState } from './theme';
import { Widget } from './Widget';
import { WidgetBackground } from './WidgetBackground';

/** Options for {@link Slider}. */
export interface SliderOptions {
  /** Width in pixels. Default `200`. */
  width?: number;
  /** Height in pixels - the room the thumb has. Default `20`. */
  height?: number;
  /** Lowest selectable value. Default `0`. */
  min?: number;
  /** Highest selectable value. Default `1`. */
  max?: number;
  /** Initial value, clamped into the range. Defaults to `min`. */
  value?: number;
  /** Rounding of the value, in value units; `0` (the default) is continuous. */
  step?: number;
  /** Thickness of the groove, in pixels. Default `6`. */
  trackThickness?: number;
  /** Diameter of the thumb, in pixels. Defaults to `height`. */
  thumbSize?: number;
}

/**
 * Horizontal value slider: a groove, a fill up to the current value, and a
 * draggable thumb.
 *
 * Dragging the thumb, clicking anywhere on the groove, and the arrow keys while
 * it holds focus all move the value and fire {@link Slider.onChange}; Home and
 * End jump to the ends. Keyboard steps use {@link Slider.step}, or a twentieth
 * of the range while the slider is continuous.
 *
 * The three surfaces are themed independently - `sliderTrack`, `sliderFill` and
 * `sliderThumb` - and all three resolve for the slider's own interaction state,
 * so hovering anywhere on the control highlights the thumb.
 *
 * @example
 * ```ts
 * const volume = new Slider({ width: 240, min: 0, max: 1, value: 0.8, step: 0.05 });
 * volume.onChange.add(value => audio.setVolume(value));
 * ```
 */
export class Slider extends Widget {
  /** Fires with the new value whenever it changes, however it changed. */
  public readonly onChange = new Signal<[value: number, slider: Slider]>();

  private readonly _track = new WidgetBackground(this, 0);
  private readonly _fill = new WidgetBackground(this, 1);
  private readonly _thumb = new WidgetBackground(this, 2);
  private readonly _min: number;
  private readonly _max: number;
  private readonly _step: number;
  private readonly _trackThickness: number;
  private readonly _thumbSize: number;
  private _value: number;
  private _pointerInside = false;
  private _dragging = false;
  /** Scratch vector reused while dragging - a pointer move must not allocate. */
  private readonly _localPoint = new Vector();

  private readonly _onGlobalPointerMove = (_pointer: Pointer, x: number, y: number): void => {
    this._seekTo(x, y);
  };

  private readonly _onGlobalPointerUp = (): void => {
    this._endDrag();
  };

  public constructor(options: SliderOptions = {}) {
    super();

    this._min = options.min ?? 0;
    this._max = Math.max(this._min, options.max ?? 1);
    this._step = Math.max(0, options.step ?? 0);
    this._trackThickness = options.trackThickness ?? 6;
    this._thumbSize = options.thumbSize ?? options.height ?? 20;
    this._value = this._quantize(options.value ?? this._min);

    this.interactive = true;
    this.focusable = true;
    this.cursor = 'pointer';
    this._trackFocus();

    this.onPointerOver.add(this._onPointerOver);
    this.onPointerOut.add(this._onPointerOut);
    this.onPointerDown.add(this._onPointerDown);
    this.onKeyDown.add(this._onKey);

    this.setSize(options.width ?? 200, options.height ?? 20);
  }

  /** Lowest selectable value. Fixed at construction. */
  public get min(): number {
    return this._min;
  }

  /** Highest selectable value. Fixed at construction. */
  public get max(): number {
    return this._max;
  }

  /** Rounding of the value in value units; `0` while the slider is continuous. */
  public get step(): number {
    return this._step;
  }

  /** Current value, clamped into `[min, max]` and rounded to {@link step}. */
  public get value(): number {
    return this._value;
  }

  public set value(next: number) {
    this._applyValue(next);
  }

  /** The value as a fraction of the range, in `[0, 1]`. */
  public get fraction(): number {
    return this._max === this._min ? 0 : (this._value - this._min) / (this._max - this._min);
  }

  /** Whether the thumb is being dragged right now. */
  public get dragging(): boolean {
    return this._dragging;
  }

  /** The state the slider currently paints in. */
  public get state(): UIWidgetState {
    return this._skinState;
  }

  /** The node painting the groove, or `null` while it paints nothing. */
  public get trackNode(): WidgetBackground['node'] {
    return this._track.node;
  }

  /** The node painting the filled part, or `null` while it paints nothing. */
  public get fillNode(): WidgetBackground['node'] {
    return this._fill.node;
  }

  /** The node painting the thumb, or `null` while it paints nothing. */
  public get thumbNode(): WidgetBackground['node'] {
    return this._thumb.node;
  }

  protected override _repaint(): void {
    const travel = Math.max(0, this._uiWidth - this._thumbSize);
    const thumbX = travel * this.fraction;
    const trackY = (this._uiHeight - this._trackThickness) / 2;
    const filled = thumbX + this._thumbSize / 2;

    this._track.apply(this._skin('sliderTrack').background, this._uiWidth, this._trackThickness);
    this._track.node?.setPosition(0, trackY);

    this._fill.apply(this._skin('sliderFill').background, filled, this._trackThickness);
    this._fill.node?.setPosition(0, trackY);

    this._thumb.apply(this._skin('sliderThumb').background, this._thumbSize, this._thumbSize);
    this._thumb.node?.setPosition(thumbX, (this._uiHeight - this._thumbSize) / 2);
  }

  protected override _onEnabledChanged(effectiveEnabled: boolean): void {
    this.interactive = effectiveEnabled;

    if (!effectiveEnabled) {
      this._endDrag();
    }

    this._refreshState();
  }

  protected override _onFocusChanged(): void {
    this._refreshState();
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
    this.onChange.destroy();
    this._track.destroy();
    this._fill.destroy();
    this._thumb.destroy();
    this._localPoint.destroy();
    super.destroy();
  }

  /** Clamp into the range and round to the step. */
  private _quantize(value: number): number {
    const clamped = clamp(value, this._min, this._max);

    if (this._step <= 0) {
      return clamped;
    }

    return clamp(this._min + Math.round((clamped - this._min) / this._step) * this._step, this._min, this._max);
  }

  /** Apply a candidate value, announcing it only when it actually moved. */
  private _applyValue(next: number): void {
    const value = this._quantize(next);

    if (value !== this._value) {
      this._value = value;
      this._invalidatePaint();
      this.onChange.dispatch(value, this);
    }
  }

  /**
   * Move the value to the one the pointer is over. The thumb has width, so the
   * usable travel is shorter than the groove and the pointer addresses the
   * thumb's centre - otherwise the ends of the range would be unreachable.
   */
  private _seekTo(x: number, y: number): void {
    const travel = this._uiWidth - this._thumbSize;

    if (travel <= 0) {
      return;
    }

    const local = this._localPoint.set(x, y).transformInverse(this.getGlobalTransform());
    const fraction = clamp((local.x - this._thumbSize / 2) / travel, 0, 1);

    this._applyValue(this._min + fraction * (this._max - this._min));
  }

  private readonly _onPointerOver = (): void => {
    this._pointerInside = true;
    this._refreshState();
  };

  private readonly _onPointerOut = (): void => {
    this._pointerInside = false;
    this._refreshState();
  };

  private readonly _onPointerDown = (event: InteractionEvent): void => {
    if (!this.effectiveEnabled) {
      return;
    }

    this._dragging = true;
    this._setSkinState('pressed');
    this._subscribeDrag(true);
    this._seekTo(event.x, event.y);
  };

  private readonly _onKey = (event: KeyEvent): void => {
    if (!this.effectiveEnabled) {
      return;
    }

    const channel = event.channel;
    const stepSize = this._step > 0 ? this._step : (this._max - this._min) / 20;

    // `channel` is a generic numeric input channel (KeyEvent.channel is `number`),
    // intentionally compared against the Keyboard enum constants - see KeyEvent docs.
    /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option */
    if (channel === Keyboard.Left || channel === Keyboard.Down) {
      this._applyValue(this._value - stepSize);
    } else if (channel === Keyboard.Right || channel === Keyboard.Up) {
      this._applyValue(this._value + stepSize);
    } else if (channel === Keyboard.Home) {
      this._applyValue(this._min);
    } else if (channel === Keyboard.End) {
      this._applyValue(this._max);
    } else {
      return;
    }
    /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */

    // A focused slider owns the arrow keys: without this they would also move
    // focus to the next widget.
    event.preventDefault();
  };

  private _endDrag(): void {
    if (!this._dragging) {
      return;
    }

    this._dragging = false;
    this._subscribeDrag(false);
    this._refreshState();
  }

  /**
   * A drag continues wherever the pointer goes, including outside the slider,
   * so it follows the application's pointer signals rather than this node's -
   * which stop the moment the pointer leaves it.
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

  private _refreshState(): void {
    if (this._dragging) {
      this._setSkinState('pressed');

      return;
    }

    let state: UIWidgetState = 'normal';

    if (!this.effectiveEnabled) {
      state = 'disabled';
    } else if (this._pointerInside) {
      state = 'hover';
    } else if (this.focused) {
      state = 'focused';
    }

    this._setSkinState(state);
  }
}
