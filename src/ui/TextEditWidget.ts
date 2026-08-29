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
import { Text } from '#rendering/text/Text';
import { caretRectAt, indexAtPoint } from '#rendering/text/textCaret';
import type { TextStyleOptions } from '#rendering/text/TextStyle';
import type { TextLayoutResult } from '#rendering/text/types';

import type { TextEditGranularity } from './TextEditingModel';
import { codePointOffsets, glyphIndexAtOffset, glyphOffsetAtIndex, graphemeOffsets, TextEditingModel } from './TextEditingModel';
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
  private _caretShown = true;
  private _blinkSeconds = 0;
  private _blinkApp: Application | null = null;
  private _pointerInside = false;
  private _dragging = false;
  private _dragAnchor = 0;
  private _lastPressTime = 0;
  private _lastPressX = 0;
  private _lastPressY = 0;
  private _shiftDown = false;
  private _controlDown = false;

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
    const channel = event.channel;

    // `channel` is a generic numeric input channel (KeyEvent.channel is
    // `number`), intentionally compared against the Keyboard enum constants
    // - see KeyEvent docs.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option
    if (channel === Keyboard.ShiftLeft || channel === Keyboard.ShiftRight) {
      this._shiftDown = false;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option
    } else if (channel === Keyboard.ControlLeft || channel === Keyboard.ControlRight) {
      this._controlDown = false;
    }
  };

  protected _handleKeyDown(event: KeyEvent): void {
    const channel = event.channel;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option
    if (channel === Keyboard.ShiftLeft || channel === Keyboard.ShiftRight) {
      this._shiftDown = true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option
    } else if (channel === Keyboard.ControlLeft || channel === Keyboard.ControlRight) {
      this._controlDown = true;
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
    switch (channel) {
      case Keyboard.Left:
        this.model.moveCaret('backward', word ? 'word' : 'character', extend);
        return true;
      case Keyboard.Right:
        this.model.moveCaret('forward', word ? 'word' : 'character', extend);
        return true;
      case Keyboard.Up:
        this.model.moveCaret('backward', 'line', extend);
        return true;
      case Keyboard.Down:
        this.model.moveCaret('forward', 'line', extend);
        return true;
      case Keyboard.Home:
        this.model.moveCaret('backward', 'line', extend);
        return true;
      case Keyboard.End:
        this.model.moveCaret('forward', 'line', extend);
        return true;
      case Keyboard.Backspace:
        if (!this._readOnly) {
          this.model.deleteContent('backward', _deleteGranularity(word, line));
        }
        return true;
      case Keyboard.Delete:
        if (!this._readOnly) {
          this.model.deleteContent('forward', _deleteGranularity(word, line));
        }
        return true;
      default:
        return this._applyShortcut(channel);
    }
    /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */
  }

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

  public override destroy(): void {
    this._stopBlink();
    this._stopPointerDrag();
    this._seam?.destroy();
    this._seam = null;
    this.model.onChange.destroy();
    this.onChange.destroy();
    this._onSubmit.destroy();
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

  private _applyIntent(intent: TextEditIntent): void {
    if (this._readOnly) {
      return;
    }

    switch (intent.kind) {
      case 'insert':
        this.model.insert(intent.text, 'input');
        break;
      case 'deleteContent':
        this.model.deleteContent(intent.direction, intent.granularity);
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
    if (!this._controlDown || this._readOnly) {
      return false;
    }

    // Clipboard shortcuts (X/C/V) are deliberately not consumed: the
    // browser performs the clipboard work on the focused transport, and the
    // resulting edits arrive as intents.
    if (channel === Keyboard.A) {
      this.model.selectAll();

      return true;
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
   * The model offset a point in widget-local space selects: the glyph the
   * point lands on, snapped to its nearer edge. When masked, the layout
   * runs over the masked text and one glyph is one grapheme of the value.
   */
  private _offsetAtLocal(localX: number, localY: number): number {
    const layout = this._textNode.currentLayout;
    const glyph = indexAtPoint(layout, localX - this._textNode.x, localY - this._textNode.y);
    const offsets = this._glyphOffsets();

    return glyphOffsetAtIndex(offsets, glyph, this.model.composedText.length);
  }

  /**
   * Offsets into the string the text node actually laid out. That is the
   * composed text, not `value`: an in-flight composition is displayed and the
   * model's focus points behind the candidate, so offsets taken over `value`
   * would pin the caret at the composition start while the candidate grows.
   * Masked fields lay out one mask glyph per grapheme, hence the split.
   */
  private _glyphOffsets(): number[] {
    return this.model.maskChar !== null ? graphemeOffsets(this.model.composedText) : codePointOffsets(this.model.composedText);
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

  /** Clamp the horizontal scroll so the caret stays inside the viewport. */
  private _refreshScroll(): void {
    const insets = this.contentInsets;
    const viewport = this._uiWidth - insets.left - insets.right;
    const layout = this._layout();
    const contentWidth = layout.advance.width;
    const offsets = this._glyphOffsets();
    const caretGlyph = glyphIndexAtOffset(offsets, this.model.focus);
    const caretX = caretRectAt(layout, caretGlyph, this._uiHeight).x;

    if (viewport <= 0) {
      this._scrollX = 0;
    } else if (caretX - this._scrollX > viewport) {
      this._scrollX = caretX - viewport;
    } else if (caretX < this._scrollX) {
      this._scrollX = caretX;
    }

    this._scrollX = Math.max(0, Math.min(this._scrollX, Math.max(0, contentWidth - viewport)));
    this._textNode.setPosition(insets.left - this._scrollX, insets.top);
    // Overlays are painted in the layout's own coordinates, so they have to
    // ride the same offset as the text they annotate - otherwise caret and
    // selection sit at the widget origin and drift further with every scroll.
    this._overlays.setPosition(insets.left - this._scrollX, insets.top);
  }

  /** Selection rectangles and the caret, painted under the text. */
  private _paintOverlays(): void {
    const graphics = this._overlays;

    graphics.clear();

    if (!this.focused) {
      return;
    }

    const layout = this._layout();

    if (layout.placements.length === 0) {
      this._paintCaret(layout);

      return;
    }

    const lineHeight = this._overlayLineHeight(layout);
    const offsets = this._glyphOffsets();
    const start = caretRectAt(layout, glyphIndexAtOffset(offsets, this.model.selectionStart), lineHeight);
    const end = caretRectAt(layout, glyphIndexAtOffset(offsets, this.model.selectionEnd), lineHeight);

    if (this.model.selectionStart !== this.model.selectionEnd) {
      const selection = resolveUISkin(this.theme.selection, 'normal').background;

      if (selection.kind === 'fill') {
        graphics.fillColor = selection.color;
        graphics.drawRectangle(start.x, start.y, end.x - start.x, lineHeight);
      }
    }

    this._paintCaret(layout);
  }

  private _paintCaret(layout: TextLayoutResult): void {
    if (!this._caretShown || this.model.composing) {
      return;
    }

    const lineHeight = this._overlayLineHeight(layout);
    const offsets = this._glyphOffsets();
    const caret = caretRectAt(layout, glyphIndexAtOffset(offsets, this.model.focus), lineHeight);
    const skin = resolveUISkin(this.theme.caret, 'normal').background;

    if (skin.kind === 'fill') {
      this._overlays.fillColor = skin.color;
      this._overlays.drawRectangle(caret.x, caret.y, 1, lineHeight);
    }
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
    const offsets = this._glyphOffsets();
    const caret = caretRectAt(layout, glyphIndexAtOffset(offsets, this.model.focus), this._overlayLineHeight(layout));

    return this._rectToWorld(new Rectangle(caret.x + this._textNode.x, caret.y + this._textNode.y, 1, caret.height));
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
