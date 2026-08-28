import type { CheckableOptions } from './CheckableWidget';
import { CheckableWidget } from './CheckableWidget';
import type { UIThemeRole } from './theme';
import { WidgetBackground } from './WidgetBackground';

/** Options for {@link Toggle}. */
export interface ToggleOptions extends CheckableOptions {
  /** Track width in pixels. Default `44`. */
  width?: number;
  /** Track height in pixels. Default `24`. */
  height?: number;
  /** Gap between the knob and the track edge, in pixels. Default `3`. */
  knobInset?: number;
}

/**
 * A switch that slides between off and on, with an optional label beside it.
 *
 * Behaviourally identical to {@link Checkbox} - same state machine, same
 * keyboard activation, same {@link CheckableWidget.onChange} - and different
 * only in what it paints: the `toggleTrack` role carries the interaction
 * states, and the `toggleKnob` role slides to the side `checked` selects.
 */
export class Toggle extends CheckableWidget {
  private readonly _track = new WidgetBackground(this, 0);
  private readonly _knob = new WidgetBackground(this, 1);
  private readonly _trackWidth: number;
  private readonly _trackHeight: number;
  private readonly _knobInset: number;

  public constructor(options: ToggleOptions = {}) {
    super(options, 'toggleTrack');

    this._trackWidth = options.width ?? 44;
    this._trackHeight = options.height ?? 24;
    this._knobInset = options.knobInset ?? 3;
    this._invalidateLayout();
  }

  /** The node painting the track, or `null` while it paints nothing. */
  public get trackNode(): WidgetBackground['node'] {
    return this._track.node;
  }

  /** The node painting the knob, or `null` while it paints nothing. */
  public get knobNode(): WidgetBackground['node'] {
    return this._knob.node;
  }

  protected override _textRole(): UIThemeRole {
    return 'toggleTrack';
  }

  protected override _controlSize(): { width: number; height: number } {
    return { width: this._trackWidth, height: this._trackHeight };
  }

  protected override _paintControl(): void {
    const knobSize = Math.max(0, this._trackHeight - this._knobInset * 2);
    const travel = Math.max(0, this._trackWidth - knobSize - this._knobInset * 2);

    this._track.apply(this._skin('toggleTrack').background, this._trackWidth, this._trackHeight);
    this._knob.apply(this._skin('toggleKnob').background, knobSize, knobSize);
    this._knob.node?.setPosition(this._knobInset + (this._checked ? travel : 0), this._knobInset);
  }

  public override destroy(): void {
    this._track.destroy();
    this._knob.destroy();
    super.destroy();
  }
}
