import { Signal } from '#core/Signal';
import type { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
import { Container } from '#rendering/Container';
import { Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import type { UIWidgetState } from './theme';
import { resolveUISkin } from './theme';
import { Widget } from './Widget';
import { type UIBackgroundNode, WidgetBackground } from './WidgetBackground';

/** One selectable entry of a {@link Dropdown}. */
export interface DropdownItem<T> {
  /** Text shown for this entry. */
  readonly label: string;
  /** The value {@link Dropdown.onChange} reports when it is picked. */
  readonly value: T;
}

/** Options for {@link Dropdown}. */
export interface DropdownOptions<T> {
  /** Width in pixels. Default `180`. */
  width?: number;
  /** Height of the closed control, and of one list row. Default `36`. */
  height?: number;
  /** The entries to choose from. */
  items?: ReadonlyArray<DropdownItem<T>>;
  /** Index selected initially; `-1` (the default) selects nothing. */
  selectedIndex?: number;
  /** Text shown while nothing is selected. Default `'Select...'`. */
  placeholder?: string;
  /** Horizontal padding of the label and the rows, in pixels. Default `12`. */
  padding?: number;
  /** Text style overrides on top of the skin's. */
  textStyle?: TextStyleOptions;
}

/**
 * One row of an open {@link Dropdown}'s list.
 *
 * @internal
 */
class DropdownRow extends Widget {
  public readonly onPick = new Signal<[row: DropdownRow]>();

  private readonly _surface = new WidgetBackground(this, 0);
  private readonly _text: Text;
  private readonly _padding: number;
  private _highlighted = false;

  public constructor(label: string, padding: number, style: TextStyleOptions) {
    super();

    this._padding = padding;
    this._text = new Text(label, style);
    this.addChild(this._text);

    this.interactive = true;
    this.cursor = 'pointer';
    this.onPointerOver.add(() => this.setHighlighted(true));
    this.onPointerOut.add(() => this.setHighlighted(false));
    this.onPointerTap.add(() => this.onPick.dispatch(this));
  }

  /** Whether this row is the one an Enter would pick. */
  public get highlighted(): boolean {
    return this._highlighted;
  }

  public setHighlighted(highlighted: boolean): void {
    if (this._highlighted !== highlighted) {
      this._highlighted = highlighted;
      this._setSkinState(highlighted ? 'hover' : 'normal');
    }
  }

  protected override _repaint(): void {
    this._surface.apply(this._skin('dropdownItem').background, this._uiWidth, this._uiHeight);
  }

  protected override _relayout(): void {
    super._relayout();

    const bounds = this._text.getLocalBounds();

    this._text.setPosition(this._padding, (this._uiHeight - bounds.height) / 2);
  }

  public override destroy(): void {
    this.onPick.destroy();
    this._surface.destroy();
    super.destroy();
  }
}

/**
 * A closed control showing the current selection that opens a list of
 * alternatives.
 *
 * Clicking it, or pressing Enter or Space while it holds focus, opens the list;
 * the arrow keys move the highlight, Enter picks it, and Escape closes without
 * changing the selection. With the list closed, the arrow keys step through the
 * entries directly, so a value can be changed without ever opening it.
 *
 * The closed control paints the `button` role - the same states a
 * {@link Button} does - the open list the `dropdownList` role, and each row the
 * `dropdownItem` role, with the highlighted row in its `hover` state. The list
 * is a child of the dropdown, so it draws above whatever the dropdown itself
 * draws above and is clipped by the same ancestors.
 */
export class Dropdown<T = string> extends Widget {
  /** Fires when the selection changes, with the value and its index. */
  public readonly onChange = new Signal<[value: T, index: number, dropdown: Dropdown<T>]>();

  private readonly _surface = new WidgetBackground(this, 0);
  private readonly _label: Text;
  private readonly _list = new Container();
  private readonly _listSurface = new WidgetBackground(this._list, 0);
  private readonly _rows: DropdownRow[] = [];
  private readonly _items: Array<DropdownItem<T>>;
  private readonly _placeholder: string;
  private readonly _padding: number;
  private readonly _textStyle: TextStyleOptions | null;
  private _rowHeight: number;
  private _selectedIndex: number;
  private _highlightIndex = -1;
  private _open = false;
  private _pointerInside = false;

  public constructor(options: DropdownOptions<T> = {}) {
    super();

    this._items = [...(options.items ?? [])];
    this._placeholder = options.placeholder ?? 'Select...';
    this._padding = options.padding ?? 12;
    this._textStyle = options.textStyle ?? null;
    this._rowHeight = options.height ?? 36;
    this._selectedIndex = options.selectedIndex ?? -1;

    this._label = new Text(this._labelText(), { ...resolveUISkin(this.theme.button, 'normal').text, align: 'left', ...this._textStyle });
    this.addChild(this._label);

    this._list.visible = false;
    this.addChild(this._list);

    this.interactive = true;
    this.focusable = true;
    this.cursor = 'pointer';
    this._trackFocus();

    this.onPointerOver.add(this._onPointerOver);
    this.onPointerOut.add(this._onPointerOut);
    this.onPointerTap.add(this._onTap);
    this.onKeyDown.add(this._onKey);

    this.setSize(options.width ?? 180, this._rowHeight);
    this._buildRows();
  }

  /** The entries to choose from. */
  public get items(): ReadonlyArray<DropdownItem<T>> {
    return this._items;
  }

  /** Replace the entries; the selection is kept only if its index still exists. */
  public setItems(items: ReadonlyArray<DropdownItem<T>>): this {
    this._items.length = 0;
    this._items.push(...items);
    this._selectedIndex = Math.min(this._selectedIndex, this._items.length - 1);
    this._buildRows();
    this._invalidateLayout();

    return this;
  }

  /** Index of the selected entry, or `-1` while nothing is selected. */
  public get selectedIndex(): number {
    return this._selectedIndex;
  }

  public set selectedIndex(index: number) {
    this._select(index);
  }

  /** The selected value, or `null` while nothing is selected. */
  public get selectedValue(): T | null {
    return this._items[this._selectedIndex]?.value ?? null;
  }

  /** Whether the list is showing. */
  public get isOpen(): boolean {
    return this._open;
  }

  /** Index the arrow keys have moved to while the list is open, or `-1`. */
  public get highlightedIndex(): number {
    return this._highlightIndex;
  }

  /** Show the list, highlighting the current selection. */
  public open(): this {
    if (!this._open && this.effectiveEnabled && this._items.length > 0) {
      this._open = true;
      this._highlightIndex = this._selectedIndex;
      this._list.visible = true;
      this._syncHighlight();
      this._refreshState();
      this._invalidateBoundsCascade();
    }

    return this;
  }

  /** Hide the list, leaving the selection as it is. */
  public close(): this {
    if (this._open) {
      this._open = false;
      this._highlightIndex = -1;
      this._list.visible = false;
      this._syncHighlight();
      this._refreshState();
      this._invalidateBoundsCascade();
    }

    return this;
  }

  /** Open the list if it is closed, close it if it is open. */
  public toggle(): this {
    return this._open ? this.close() : this.open();
  }

  /** The state the closed control currently paints in. */
  public get state(): UIWidgetState {
    return this._skinState;
  }

  /** The node painting the closed control, or `null` while it paints nothing. */
  public get backgroundNode(): UIBackgroundNode | null {
    return this._surface.node;
  }

  /** The container holding the open list, for placement or clipping by a caller. */
  public get listNode(): Container {
    return this._list;
  }

  protected override _repaint(): void {
    this._surface.apply(resolveUISkin(this.theme.button, this._skinState).background, this._uiWidth, this._uiHeight);
    this._listSurface.apply(this._skin('dropdownList').background, this._uiWidth, this._rowHeight * this._rows.length);
  }

  protected override _relayout(): void {
    super._relayout();

    const bounds = this._label.getLocalBounds();

    this._label.setPosition(this._padding, (this._uiHeight - bounds.height) / 2);
    this._list.setPosition(0, this._uiHeight);

    for (const [index, row] of this._rows.entries()) {
      row.setSize(this._uiWidth, this._rowHeight);
      row.setPosition(0, index * this._rowHeight);
    }
  }

  protected override _onEnabledChanged(effectiveEnabled: boolean): void {
    this.interactive = effectiveEnabled;

    if (!effectiveEnabled) {
      this.close();
    }

    this._refreshState();
  }

  protected override _onFocusChanged(focused: boolean): void {
    if (!focused) {
      this.close();
    }

    this._refreshState();
  }

  public override destroy(): void {
    this.onChange.destroy();
    this._surface.destroy();
    this._listSurface.destroy();
    super.destroy();
  }

  /** The text the closed control shows for the current selection. */
  private _labelText(): string {
    return this._items[this._selectedIndex]?.label ?? this._placeholder;
  }

  /** Rebuild one row per entry. Rows are cheap and the list is short, so a change replaces them wholesale. */
  private _buildRows(): void {
    for (const row of this._rows) {
      row.destroy();
    }

    this._rows.length = 0;

    const style: TextStyleOptions = { ...resolveUISkin(this.theme.dropdownItem, 'normal').text, ...this._textStyle };

    for (const item of this._items) {
      const row = new DropdownRow(item.label, this._padding, style);

      row.onPick.add(picked => {
        this._select(this._rows.indexOf(picked));
        this.close();
      });

      this._rows.push(row);
      this._list.addChild(row);
    }
  }

  /** Select `index`, announcing it only when it actually changed. */
  private _select(index: number): void {
    const next = index >= 0 && index < this._items.length ? index : -1;

    if (next === this._selectedIndex) {
      return;
    }

    this._selectedIndex = next;
    this._label.text = this._labelText();
    this._invalidateLayout();

    const item = this._items[next];

    if (item !== undefined) {
      this.onChange.dispatch(item.value, next, this);
    }
  }

  /** Move the open list's highlight, or the selection itself while it is closed. */
  private _step(direction: 1 | -1): void {
    if (this._items.length === 0) {
      return;
    }

    if (!this._open) {
      this._select(clampIndex(this._selectedIndex + direction, this._items.length));

      return;
    }

    this._highlightIndex = clampIndex(this._highlightIndex + direction, this._items.length);
    this._syncHighlight();
  }

  private _syncHighlight(): void {
    for (const [index, row] of this._rows.entries()) {
      row.setHighlighted(index === this._highlightIndex);
    }
  }

  private readonly _onPointerOver = (): void => {
    this._pointerInside = true;
    this._refreshState();
  };

  private readonly _onPointerOut = (): void => {
    this._pointerInside = false;
    this._refreshState();
  };

  private readonly _onTap = (): void => {
    if (this.effectiveEnabled) {
      this.toggle();
    }
  };

  private readonly _onKey = (event: KeyEvent): void => {
    if (!this.effectiveEnabled) {
      return;
    }

    const channel = event.channel;

    // `channel` is a generic numeric input channel (KeyEvent.channel is `number`),
    // intentionally compared against the Keyboard enum constants - see KeyEvent docs.
    /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option */
    if (channel === Keyboard.Down) {
      this._step(1);
    } else if (channel === Keyboard.Up) {
      this._step(-1);
    } else if (channel === Keyboard.Escape) {
      if (!this._open) {
        return;
      }

      this.close();
    } else if (channel === Keyboard.Enter || channel === Keyboard.Space) {
      if (this._open) {
        this._select(this._highlightIndex);
        this.close();
      } else {
        this.open();
      }
    } else {
      return;
    }
    /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */

    // A focused dropdown owns these keys: without this they would also move
    // focus to the next widget.
    event.preventDefault();
  };

  private _refreshState(): void {
    let state: UIWidgetState = 'normal';

    if (!this.effectiveEnabled) {
      state = 'disabled';
    } else if (this._open) {
      state = 'pressed';
    } else if (this._pointerInside) {
      state = 'hover';
    } else if (this.focused) {
      state = 'focused';
    }

    this._setSkinState(state);
  }
}

/** The index `raw` lands on when stepping through `count` entries, without wrapping past either end. */
const clampIndex = (raw: number, count: number): number => Math.max(0, Math.min(raw, count - 1));
