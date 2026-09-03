import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import type { InteractionEvent } from '#input/InteractionEvent';
import type { KeyEvent } from '#input/KeyEvent';
import type { Pointer } from '#input/Pointer';
import { Keyboard } from '#input/types';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import type { PlatformTextInput, PlatformTextInputHints, TextEditIntent } from '#platform/PlatformTextInput';
import { Graphics } from '#rendering/primitives/Graphics';
import { caretRectOnLine, glyphAtPointOnLine, lineAtPoint } from '#rendering/text/caret';
import { Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';
import type { TextLayoutResult } from '#rendering/text/types';

import type { TextEditGranularity } from './TextEditingModel';
import { codePointOffsets, glyphCount, glyphOffsetAtIndex, graphemeOffsets, lineStartAt, TextEditingModel } from './TextEditingModel';
import type { UIWidgetState } from './theme';
import { resolveUISkin } from './theme';
import { Widget } from './Widget';
import { WidgetBackground } from './WidgetBackground';

/** Options for the shared text-editing widget base. */
export interface TextEditWidgetOptions {
  /** Visible width in pixels. Default `200`. */
  width?: number;
  /** Visible height in pixels. Default `36`. */
  height?: number;
  /** Initial value. Default `''`. */
  value?: string;
  /** Whether newlines are accepted. Default `false`. */
  multiline?: boolean;
  /** When set, the field renders and takes focus but rejects every edit. Default `false`. */
  readOnly?: boolean;
  /** Text style overrides on top of the surface skin's. */
  textStyle?: TextStyleOptions;
}

/** Seconds one caret blink phase lasts. */
const BLINK_PHASE_SECONDS = 0.5;

/** Maximum milliseconds between two presses that still count as a double-click. */
const DOUBLE_CLICK_MS = 350;

/**
 * Modifier keys a field tracks while it holds focus. Both sides of each pair
 * are tracked separately, so releasing one while the other is still held does
 * not report the modifier as released.
 */
const modifierChannels = new Set<number>([Keyboard.ShiftLeft, Keyboard.ShiftRight, Keyboard.ControlLeft, Keyboard.ControlRight]);

/** The granularity a delete asks for; the word modifier wins over the line modifier. */
const _deleteGranularity = (word: boolean, line: boolean): TextEditGranularity => {
  if (word) {
    return 'word';
  }

  return line ? 'line' : 'character';
};

/**
 * Shared machinery of the text-editing widgets ({@link TextInput}, and the
 * multi-line field to come): the {@link TextEditingModel}, the platform
 * transport binding, caret blink, selection and caret painting, placeholder
 * rendering, horizontal scroll-to-caret, and the keyboard/pointer editing
 * gestures.
 *
 * The platform transport is created lazily on first focus and may be `null`
 * - the field then renders and takes focus but rejects edits. Key handling
 * consumes every editing key with `preventDefault`, so focus navigation
 * never also reacts while editing; `Escape` and `Tab` are deliberately not
 * consumed. The caret blink rides the app's frame signal like a
 * {@link Tooltip}'s show delay - it pauses with the scene and runs no timer
 * while the field is unfocused.
 *
 * @internal
 */
export abstract class TextEditWidget extends Widget {
  /** Fires whenever the value changed, however it changed. */
  public readonly onChange = new Signal<[value: string]>();

  /** Fires when the user confirms the field with `Enter`. */
  protected readonly _onSubmit = new Signal<[value: string]>();

  /** The editing core. */
  protected readonly model: TextEditingModel;

  private readonly _surface = new WidgetBackground(this, 0);
  private readonly _overlays = new Graphics();
  private readonly _textNode: Text;
  private readonly _placeholderNode: Text;
  private readonly _textStyle: TextStyleOptions | null;
  private _appliedText: TextStyleOptions | null = null;
  private _appliedPlaceholder: TextStyleOptions | null = null;
  private _readOnly: boolean;
  private _placeholder = '';
  private readonly _hints: PlatformTextInputHints = {};
  private _seam: PlatformTextInput | null = null;
  private _scrollX = 0;
  private _scrollY = 0;
  private _goalX: number | null = null;
  private _caretShown = true;
  private _blinkSeconds = 0;
  private _blinkApp: Application | null = null;
  private _pointerInside = false;
  private _dragging = false;
  private _dragAnchor = 0;
  private _lastPressTime = 0;
  private _lastPressX = 0;
  private _lastPressY = 0;
  private readonly _modifiersDown = new Set<number>();
  /**
   * Mutations the transport already reported for a keystroke whose engine key
   * event has not been dispatched yet. A host turns one physical key into a
   * semantic edit synchronously, while the engine dispatches its key event at
   * the next frame boundary, so the widget sees the same Backspace or Enter
   * twice and must apply it once. Counters rather than flags: several
   * keystrokes can land inside a single frame.
   */
  private _hostDeletes = 0;
  private _hostLineBreaks = 0;

  private readonly _onFrame = (delta: Seconds): void => {
    if (this._blinkApp?.scenes.currentScene?.paused === true) {
      return;
    }

    this._blinkSeconds += delta;

    if (this._blinkSeconds >= BLINK_PHASE_SECONDS) {
      this._blinkSeconds -= BLINK_PHASE_SECONDS;
      this._caretShown = !this._caretShown;
      this._paintOverlays();
    }
  };

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

    this.focus();
    this._goalX = null;

    const x = event.x;
    const y = event.y;
    const local = this._localPoint.set(x, y).transformInverse(this.getGlobalTransform());
    const offset = this._offsetAtLocal(local.x, local.y);
    const now = performance.now();
    const isDoublePress = now - this._lastPressTime < DOUBLE_CLICK_MS && Math.abs(x - this._lastPressX) < 4 && Math.abs(y - this._lastPressY) < 4;

    this._lastPressTime = now;
    this._lastPressX = x;
    this._lastPressY = y;

    if (isDoublePress) {
      const range = this.model.wordRangeAt(offset);

      this.model.setSelection(range.start, range.end);
      this._stopPointerDrag();
    } else {
      this.model.setSelection(offset, offset);
      this._dragAnchor = offset;
      this._startPointerDrag();
    }

    this._afterModelChange();
  };

  private readonly _onPointerDragMove = (_pointer: Pointer, x: number, y: number): void => {
    if (!this._dragging) {
      return;
    }

    const local = this._localPoint.set(x, y).transformInverse(this.getGlobalTransform());

    this.model.setSelection(this._dragAnchor, this._offsetAtLocal(local.x, local.y));
    this._afterModelChange();
  };

  private readonly _onPointerDragEnd = (): void => {
    this._stopPointerDrag();
  };

  private readonly _keyDownHandler = (event: KeyEvent): void => {
    this._handleKeyDown(event);
  };

  private readonly _keyUpHandler = (event: KeyEvent): void => {
    this._modifiersDown.delete(event.channel);
  };

  protected _handleKeyDown(event: KeyEvent): void {
    const channel = event.channel;

    if (modifierChannels.has(channel)) {
      this._modifiersDown.add(channel);
    }

    if (!this.effectiveEnabled) {
      return;
    }

    // `channel` is a generic numeric input channel (KeyEvent.channel is
    // `number`), intentionally compared against the Keyboard enum constants
    // - see KeyEvent docs.
    /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option */
    if (channel === Keyboard.Enter) {
      event.preventDefault();

      if (this.model.multiline) {
        if (this._hostLineBreaks > 0) {
          this._hostLineBreaks--;
        } else if (!this._readOnly && this.model.insert('\n')) {
          this._afterModelChange();
        }

        return;
      }

      this._onSubmit.dispatch(this.model.value);

      return;
    }

    if (channel === Keyboard.Escape) {
      // Releases focus without consuming the key: whatever sits above the
      // field still sees it.
      this.blur();

      return;
    }

    const extend = this._shiftDown;
    const word = this._controlDown;
    const consumed = this._handleEditKeys(channel, extend, word, this._shiftDown);
    /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */

    if (consumed) {
      event.preventDefault();
      this._afterModelChange();
    }
  }

  private _handleEditKeys(channel: number, extend: boolean, word: boolean, line: boolean): boolean {
    // `channel` is a generic numeric input channel (KeyEvent.channel is
    // `number`), intentionally compared against the Keyboard enum constants
    // - see KeyEvent docs.
    /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option */
    if (channel !== Keyboard.Up && channel !== Keyboard.Down && channel !== Keyboard.PageUp && channel !== Keyboard.PageDown) {
      this._goalX = null;
    }

    switch (channel) {
      case Keyboard.Left:
        this.model.moveCaret('backward', word ? 'word' : 'character', extend);
        return true;
      case Keyboard.Right:
        this.model.moveCaret('forward', word ? 'word' : 'character', extend);
        return true;
      case Keyboard.Up:
        this._moveByLines(-1, extend);
        return true;
      case Keyboard.Down:
        this._moveByLines(1, extend);
        return true;
      case Keyboard.PageUp:
        this._moveByLines(-this._visibleLineCount(), extend);
        return true;
      case Keyboard.PageDown:
        this._moveByLines(this._visibleLineCount(), extend);
        return true;
      case Keyboard.Home:
        this.model.moveCaret('backward', 'line', extend);
        return true;
      case Keyboard.End:
        this.model.moveCaret('forward', 'line', extend);
        return true;
      case Keyboard.Backspace:
        this._deleteContent('backward', word, line);
        return true;
      case Keyboard.Delete:
        this._deleteContent('forward', word, line);
        return true;
      default:
        return this._applyShortcut(channel);
    }
    /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */
  }

  private readonly _fieldRect = new Rectangle();
  private readonly _localPoint = new Vector();
  private readonly _scratchTopLeft = new Vector();
  private readonly _scratchBottomRight = new Vector();

  protected constructor(options: TextEditWidgetOptions) {
    super();

    this._readOnly = options.readOnly ?? false;
    this._textStyle = options.textStyle !== undefined && Object.keys(options.textStyle).length > 0 ? { ...options.textStyle } : null;
    this.model = new TextEditingModel({ multiline: options.multiline ?? false });

    this._overlays.interactive = false;
    // 'pre' is load-bearing: the default 'pre-line' collapses runs of spaces
    // and tabs, so a field's layout would hold fewer glyphs than the model
    // holds offsets and every caret, selection rect and hit test past the
    // first double space would be off by the collapsed characters.
    this._textNode = new Text('', { whiteSpace: 'pre' });
    this._placeholderNode = new Text('', { whiteSpace: 'pre' });
    this._placeholderNode.interactive = false;

    this.addChild(this._overlays);
    this.addChild(this._textNode);
    this.addChild(this._placeholderNode);

    this.clip = true;
    this.interactive = true;
    this.focusable = true;
    this.cursor = 'text';
    this._trackFocus();

    this.model.onChange.add(value => this.onChange.dispatch(value));

    this.onPointerOver.add(this._onPointerOver);
    this.onPointerOut.add(this._onPointerOut);
    this.onPointerDown.add(this._onPointerDown);
    this.onKeyDown.add(this._keyDownHandler);
    this.onKeyUp.add(this._keyUpHandler);

    if (options.value !== undefined) {
      this.model.setValue(options.value);
    }

    this.setSize(options.width ?? 200, options.height ?? 36);
  }

  /** The text held, never masked. Assigning replaces the whole value. */
  public get value(): string {
    return this.model.value;
  }

  public set value(text: string) {
    if (this.model.setValue(text)) {
      this._afterModelChange();
    }
  }

  /** The text the field displays - the value with the mask applied, if any. */
  public get renderedText(): string {
    return this.model.renderedText;
  }

  /** When set, the field renders and takes focus but rejects every edit. */
  public get readOnly(): boolean {
    return this._readOnly;
  }

  public set readOnly(value: boolean) {
    this._readOnly = value;
  }

  /** The hint shown while the field holds no text. */
  public get placeholder(): string {
    return this._placeholder;
  }

  public set placeholder(value: string) {
    if (this._placeholder !== value) {
      this._placeholder = value;
      this._placeholderNode.text = value;
      this._invalidatePaint();
    }
  }

  /** Whether the field currently holds host-side focus. */
  public get editing(): boolean {
    return this.focused;
  }

  /** Where the selection starts, independent of the direction it was drawn in. */
  public get selectionStart(): number {
    return this.model.selectionStart;
  }

  /** Where the selection ends, independent of the direction it was drawn in. */
  public get selectionEnd(): number {
    return this.model.selectionEnd;
  }

  /** Select everything. */
  public selectAll(): this {
    this.model.selectAll();
    this._afterModelChange();

    return this;
  }

  /** @internal */
  public get textNode(): Text {
    return this._textNode;
  }

  /** @internal */
  public get placeholderNode(): Text {
    return this._placeholderNode;
  }

  /** @internal */
  public get overlayNode(): Graphics {
    return this._overlays;
  }

  /**
   * The field's own box, not the text behind it. A value wider or taller than
   * the field scrolls inside it, so the child extent is not what should be
   * clipped to, hit-tested against, or laid out around.
   */
  public override updateBounds(): this {
    this._fieldRect.set(0, 0, this._uiWidth, this._uiHeight);
    this._bounds.reset().addRect(this._fieldRect, this.getGlobalTransform());

    return this;
  }

  public override destroy(): void {
    this._stopBlink();
    this._stopPointerDrag();
    this._seam?.destroy();
    this._seam = null;
    this.model.onChange.destroy();
    this.onChange.destroy();
    this._onSubmit.destroy();
    this._fieldRect.destroy();
    this._localPoint.destroy();
    this._scratchTopLeft.destroy();
    this._scratchBottomRight.destroy();
    super.destroy();
  }

  protected override _repaint(): void {
    this._applyTextStyle();
    this._surface.apply(this._skin('textFieldSurface').background, this._uiWidth, this._uiHeight);
    this._syncTextNode();
    this._updatePlaceholderVisibility();
    this._paintOverlays();
  }

  protected override _relayout(): void {
    super._relayout();
    this._refreshScroll();
  }

  protected override _onThemeChanged(): void {
    this._appliedText = null;
    this._appliedPlaceholder = null;
    super._onThemeChanged();
  }

  protected override _onEnabledChanged(effectiveEnabled: boolean): void {
    this.interactive = effectiveEnabled;
    this._refreshState();

    if (!effectiveEnabled && this.focused) {
      this.blur();
    }
  }

  protected override _onFocusChanged(focused: boolean): void {
    this._refreshState();

    if (focused) {
      this._gainEditFocus();
    } else {
      this._loseEditFocus();
    }
  }

  /** The content box the text sits in, from the surface skin's insets. */
  protected get contentInsets(): { left: number; top: number; right: number; bottom: number } {
    return this._skin('textFieldSurface').insets;
  }

  /** Assign input-method hints; forwarded to the transport on the next sync. */
  protected _setHints(hints: PlatformTextInputHints): void {
    Object.assign(this._hints, hints);
    this._seam?.setHints(this._hints);
  }

  /** Whether either Shift key is held while this field has focus. */
  private get _shiftDown(): boolean {
    return this._modifiersDown.has(Keyboard.ShiftLeft) || this._modifiersDown.has(Keyboard.ShiftRight);
  }

  /** Whether either Control key is held while this field has focus. */
  private get _controlDown(): boolean {
    return this._modifiersDown.has(Keyboard.ControlLeft) || this._modifiersDown.has(Keyboard.ControlRight);
  }

  private _refreshState(): void {
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

  private _gainEditFocus(): void {
    this._caretShown = true;
    this._blinkSeconds = 0;

    const app = this._stage?.app ?? null;

    if (app !== null) {
      this._blinkApp = app;
      app.onFrame.add(this._onFrame);
    }

    this._bindSeam();
    this._invalidatePaint();
    this._syncSeam();
    this._seam?.focus();
  }

  private _loseEditFocus(): void {
    this._stopBlink();
    // A modifier released while another node holds focus is never seen here,
    // so anything still held has to be forgotten rather than left latched.
    this._modifiersDown.clear();
    this._hostDeletes = 0;
    this._hostLineBreaks = 0;
    this._seam?.blur();
    this.model.setComposition(null);
    this._invalidatePaint();
    this._syncSeam();
    this._seam?.destroy();
    this._seam = null;
  }

  private _stopBlink(): void {
    if (this._blinkApp !== null) {
      this._blinkApp.onFrame.remove(this._onFrame);
      this._blinkApp = null;
    }
  }

  private _bindSeam(): void {
    if (this._seam !== null) {
      return;
    }

    const platform = this._stage?.app?.platform ?? null;

    if (platform === null) {
      return;
    }

    const seam = platform.createTextInput();

    if (seam === null) {
      return;
    }

    this._seam = seam;
    this._seam.onEdit.add(intent => this._applyIntent(intent));
    this._seam.onComposition.add(state => {
      this.model.setComposition(state);
      this._afterModelChange();
    });
  }

  /**
   * Apply the delete a keystroke asks for, unless the transport already
   * reported the same one - see {@link TextEditWidget._hostDeletes}.
   */
  private _deleteContent(direction: 'backward' | 'forward', word: boolean, line: boolean): void {
    if (this._readOnly) {
      return;
    }

    if (this._hostDeletes > 0) {
      this._hostDeletes--;

      return;
    }

    this.model.deleteContent(direction, _deleteGranularity(word, line));
  }

  private _applyIntent(intent: TextEditIntent): void {
    this._goalX = null;

    if (this._readOnly) {
      return;
    }

    switch (intent.kind) {
      case 'insert':
        this.model.insert(intent.text, 'input');

        if (intent.text === '\n') {
          this._hostLineBreaks++;
        }
        break;
      case 'deleteContent':
        this.model.deleteContent(intent.direction, intent.granularity);
        this._hostDeletes++;
        break;
      case 'historyUndo':
        this.model.undo();
        break;
      case 'historyRedo':
        this.model.redo();
        break;
    }

    this._afterModelChange();
  }

  private _applyShortcut(channel: number): boolean {
    // `channel` is a generic numeric input channel (KeyEvent.channel is
    // `number`), intentionally compared against the Keyboard enum constants
    // - see KeyEvent docs.
    /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option */
    if (!this._controlDown) {
      return false;
    }

    // Clipboard shortcuts (X/C/V) are deliberately not consumed: the
    // browser performs the clipboard work on the focused transport, and the
    // resulting edits arrive as intents.
    if (channel === Keyboard.A) {
      // Selecting is not editing: a read-only field is still copied from.
      this.model.selectAll();

      return true;
    }

    if (this._readOnly) {
      return false;
    }

    if (channel === Keyboard.Z) {
      this.model.undo();

      return true;
    }

    if (channel === Keyboard.Y) {
      this.model.redo();

      return true;
    }
    /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */

    return false;
  }

  private _startPointerDrag(): void {
    if (this._dragging) {
      return;
    }

    const app = this._stage?.app;

    if (app === undefined) {
      return;
    }

    this._dragging = true;
    app.input.onPointerMove.add(this._onPointerDragMove);
    app.input.onPointerUp.add(this._onPointerDragEnd);
    app.input.onPointerCancel.add(this._onPointerDragEnd);
  }

  private _stopPointerDrag(): void {
    if (!this._dragging) {
      return;
    }

    this._dragging = false;

    const app = this._stage?.app;

    if (app === undefined) {
      return;
    }

    app.input.onPointerMove.remove(this._onPointerDragMove);
    app.input.onPointerUp.remove(this._onPointerDragEnd);
    app.input.onPointerCancel.remove(this._onPointerDragEnd);
  }

  /**
   * Move the caret `delta` lines, keeping the column the caret last chose
   * horizontally. Without a remembered goal, walking down past a short line
   * and back up would pull the caret to that short line's end and leave it
   * there. A single-line field has nowhere to go, so the caret jumps to the
   * value's start or end instead - which is what Up and Down do in one.
   */
  private _moveByLines(delta: number, extend: boolean): void {
    if (!this.model.multiline) {
      this.model.moveCaret(delta < 0 ? 'backward' : 'forward', 'line', extend);

      return;
    }

    const layout = this._layout();
    const lineBox = this._lineBox(layout);
    const at = this._locate(this.model.focus);
    const goalX = this._goalX ?? caretRectOnLine(layout, at.line, at.glyph, lineBox).x;
    const target = Math.max(0, Math.min(layout.lines.length - 1, at.line + delta));
    const offset = this._offsetAt(target, glyphAtPointOnLine(layout, target, goalX));

    this.model.setSelection(extend ? this.model.anchor : offset, offset);
    this._goalX = goalX;
  }

  /** How many whole line boxes the content area shows - one page of vertical motion. */
  private _visibleLineCount(): number {
    const insets = this.contentInsets;
    const lineBox = this._lineBox(this._layout());
    const viewport = this._uiHeight - insets.top - insets.bottom;

    return lineBox > 0 ? Math.max(1, Math.floor(viewport / lineBox)) : 1;
  }

  /**
   * The model offset a point in widget-local space selects: the glyph the
   * point lands on, snapped to its nearer edge, on the line the point falls
   * on.
   */
  private _offsetAtLocal(localX: number, localY: number): number {
    const layout = this._layout();
    const line = lineAtPoint(layout, localY - this._textNode.y, this._lineBox(layout));
    const glyph = glyphAtPointOnLine(layout, line, localX - this._textNode.x);

    return this._offsetAt(line, glyph);
  }

  /**
   * Where a model offset sits in the layout: which line, and how many glyphs
   * into it.
   *
   * The mapping runs over the composed text, not `value` - an in-flight
   * composition is displayed and the model's focus points behind the
   * candidate, so a mapping taken over `value` would pin the caret at the
   * composition start while the candidate grows. A masked field lays its mask
   * out as one glyph per grapheme and holds no line breaks, so it is always
   * line 0.
   */
  private _locate(offset: number): { line: number; glyph: number } {
    const text = this.model.composedText;
    const clamped = Math.max(0, Math.min(offset, text.length));

    if (this.model.maskChar !== null) {
      return { line: 0, glyph: glyphCount(text.slice(0, clamped)) };
    }

    const start = lineStartAt(text, clamped);
    let line = 0;

    for (let i = text.indexOf('\n'); i !== -1 && i < start; i = text.indexOf('\n', i + 1)) {
      line++;
    }

    return { line, glyph: codePointOffsets(text.slice(start, clamped)).length };
  }

  /** The inverse of {@link TextEditWidget._locate}. */
  private _offsetAt(line: number, glyph: number): number {
    const text = this.model.composedText;

    if (this.model.maskChar !== null) {
      const offsets = graphemeOffsets(text);

      return glyphOffsetAtIndex(offsets, glyph, text.length);
    }

    let start = 0;

    for (let i = 0; i < line; i++) {
      const next = text.indexOf('\n', start);

      if (next === -1) {
        break;
      }

      start = next + 1;
    }

    const lineText = text.slice(start, !text.includes('\n', start) ? text.length : text.indexOf('\n', start));
    const offsets = codePointOffsets(lineText);

    return start + glyphOffsetAtIndex(offsets, glyph, lineText.length);
  }

  /**
   * Height of one line box. A single-line field spreads its caret over the
   * whole content box, which is what makes the caret look like a field caret
   * rather than a text-sized tick; a multi-line field has to use the real line
   * advance, or lines would overlap.
   */
  private _lineBox(layout: TextLayoutResult): number {
    if (this.model.multiline) {
      const lines = layout.lines.length;

      if (lines > 0) {
        return layout.advance.height / lines;
      }

      const style = this._textNode.style;

      return style.fontSize * style.lineHeight + style.leading;
    }

    return this._overlayLineHeight(layout);
  }

  /** The layout the text node settled, shared by caret painting and hit testing. */
  private _layout(): TextLayoutResult {
    return this._textNode.currentLayout;
  }

  private _applyTextStyle(): void {
    const skinText = this._skin('textFieldSurface').text;

    if (skinText !== this._appliedText) {
      this._appliedText = skinText;
      this._textNode.style = { ...skinText, ...this._textStyle };
    }

    const placeholderText = this._skin('placeholder').text;

    if (placeholderText !== this._appliedPlaceholder) {
      this._appliedPlaceholder = placeholderText;
      this._placeholderNode.style = { ...placeholderText };
    }
  }

  private _updatePlaceholderVisibility(): void {
    this._placeholderNode.visible = this.model.renderedText === '' && this._placeholder !== '';
    this._placeholderNode.setPosition(this.contentInsets.left, this.contentInsets.top);
  }

  /** Clamp the scroll offsets so the caret stays inside the viewport, on both axes. */
  private _refreshScroll(): void {
    const insets = this.contentInsets;
    const viewportWidth = this._uiWidth - insets.left - insets.right;
    const viewportHeight = this._uiHeight - insets.top - insets.bottom;
    const layout = this._layout();
    const lineBox = this._lineBox(layout);
    const caret = this._caretRectLocal(layout, lineBox);

    if (viewportWidth <= 0) {
      this._scrollX = 0;
    } else if (caret.x - this._scrollX > viewportWidth) {
      this._scrollX = caret.x - viewportWidth;
    } else if (caret.x < this._scrollX) {
      this._scrollX = caret.x;
    }

    this._scrollX = Math.max(0, Math.min(this._scrollX, Math.max(0, layout.advance.width - viewportWidth)));

    if (!this.model.multiline || viewportHeight <= 0) {
      this._scrollY = 0;
    } else {
      if (caret.y + lineBox - this._scrollY > viewportHeight) {
        this._scrollY = caret.y + lineBox - viewportHeight;
      } else if (caret.y < this._scrollY) {
        this._scrollY = caret.y;
      }

      this._scrollY = Math.max(0, Math.min(this._scrollY, Math.max(0, layout.advance.height - viewportHeight)));
    }

    this._textNode.setPosition(insets.left - this._scrollX, insets.top - this._scrollY);
    // Overlays are painted in the layout's own coordinates, so they have to
    // ride the same offset as the text they annotate - otherwise caret and
    // selection sit at the widget origin and drift further with every scroll.
    this._overlays.setPosition(insets.left - this._scrollX, insets.top - this._scrollY);
  }

  /** Selection rectangles and the caret, painted under the text. */
  private _paintOverlays(): void {
    const graphics = this._overlays;

    graphics.clear();

    if (!this.focused) {
      return;
    }

    const layout = this._layout();
    const lineBox = this._lineBox(layout);

    if (this.model.selectionStart !== this.model.selectionEnd) {
      const selection = resolveUISkin(this.theme.selection, 'normal').background;

      if (selection.kind === 'fill') {
        graphics.fillColor = selection.color;
        this._paintSelection(layout, lineBox);
      }
    }

    this._paintCaret(layout, lineBox);
  }

  /**
   * One rectangle per line the selection touches. A line fully inside the
   * selection is painted to its own advance edge rather than to the widest
   * line's, so a selection follows the text instead of a bounding box.
   */
  private _paintSelection(layout: TextLayoutResult, lineBox: number): void {
    const from = this._locate(this.model.selectionStart);
    const to = this._locate(this.model.selectionEnd);

    for (let line = from.line; line <= to.line; line++) {
      const metrics = layout.lines[line];

      if (metrics === undefined) {
        continue;
      }

      const left = line === from.line ? caretRectOnLine(layout, line, from.glyph, lineBox).x : metrics.x;
      const right = line === to.line ? caretRectOnLine(layout, line, to.glyph, lineBox).x : metrics.x + metrics.width;

      if (right > left) {
        this._overlays.drawRectangle(left, metrics.y, right - left, lineBox);
      }
    }
  }

  private _paintCaret(layout: TextLayoutResult, lineBox: number): void {
    if (!this._caretShown || this.model.composing) {
      return;
    }

    const caret = this._caretRectLocal(layout, lineBox);
    const skin = resolveUISkin(this.theme.caret, 'normal').background;

    if (skin.kind === 'fill') {
      this._overlays.fillColor = skin.color;
      this._overlays.drawRectangle(caret.x, caret.y, 1, lineBox);
    }
  }

  /** The caret rectangle in the layout's own space. */
  private _caretRectLocal(layout: TextLayoutResult, lineBox: number): Rectangle {
    const at = this._locate(this.model.focus);

    return caretRectOnLine(layout, at.line, at.glyph, lineBox);
  }

  private _overlayLineHeight(layout: TextLayoutResult): number {
    const insets = this.contentInsets;
    const contentHeight = this._uiHeight - insets.top - insets.bottom;

    return contentHeight > 0 ? contentHeight : layout.advance.height;
  }

  /** Mirror value, selection, geometry and hints into the transport. */
  private _syncSeam(): void {
    const seam = this._seam;

    if (seam === null) {
      return;
    }

    seam.setHints(this._hints);
    seam.setValue(this.model.value, this.model.selectionStart, this.model.selectionEnd);
    seam.setBounds(this._rectToWorld(new Rectangle(0, 0, this._uiWidth, this._uiHeight)));
    seam.setCaretRect(this._caretRectWorld());
  }

  private _afterModelChange(): void {
    this._syncTextNode();
    this._updatePlaceholderVisibility();
    this._refreshScroll();
    this._paintOverlays();
    this._syncSeam();
  }

  /** Push the displayed text (value, mask and in-flight composition) into the text node. */
  private _syncTextNode(): void {
    this._textNode.text = this.model.renderedText;
  }

  private _caretRectWorld(): Rectangle {
    const layout = this._layout();
    const lineBox = this._lineBox(layout);
    const caret = this._caretRectLocal(layout, lineBox);

    return this._rectToWorld(new Rectangle(caret.x + this._textNode.x, caret.y + this._textNode.y, 1, lineBox));
  }

  /** Map a rect in widget-local space to world space through the global transform. */
  private _rectToWorld(rect: Rectangle): Rectangle {
    const transform = this.getGlobalTransform();

    this._scratchTopLeft.set(rect.x, rect.y).transform(transform);
    this._scratchBottomRight.set(rect.x + rect.width, rect.y + rect.height).transform(transform);

    const minX = Math.min(this._scratchTopLeft.x, this._scratchBottomRight.x);
    const minY = Math.min(this._scratchTopLeft.y, this._scratchBottomRight.y);
    const maxX = Math.max(this._scratchTopLeft.x, this._scratchBottomRight.x);
    const maxY = Math.max(this._scratchTopLeft.y, this._scratchBottomRight.y);

    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
  }
}
