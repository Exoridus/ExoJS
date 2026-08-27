import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { UIFillBackground, UITheme } from '#ui/theme';
import { createUITheme, defaultUITheme } from '#ui/theme';
import { UIRoot } from '#ui/UIRoot';
import { Widget } from '#ui/Widget';

class ProbeWidget extends Widget {
  public paints = 0;
  public layouts = 0;

  protected override _repaint(): void {
    this.paints++;
  }

  protected override _relayout(): void {
    this.layouts++;
    super._relayout();
  }

  /** The panel fill this widget currently resolves, for state-free assertions. */
  public get panelColor(): Color {
    return (this._skin('panel').background as UIFillBackground).color;
  }
}

const red: UITheme = createUITheme({
  panel: { normal: { background: { kind: 'fill', color: new Color(255, 0, 0, 1), borderColor: Color.black, borderWidth: 0, cornerRadius: 0 } } },
});
const blue: UITheme = createUITheme({
  panel: { normal: { background: { kind: 'fill', color: new Color(0, 0, 255, 1), borderColor: Color.black, borderWidth: 0, cornerRadius: 0 } } },
});

describe('theme cascade', () => {
  test('a detached widget reads the default theme', () => {
    expect(new ProbeWidget().theme).toBe(defaultUITheme);
  });

  test('attaching to a UI layer adopts that layer theme', () => {
    const root = new UIRoot();
    const widget = new ProbeWidget();

    root.theme = red;
    root.addChild(widget);

    expect(widget.theme).toBe(red);
  });

  test('assigning a layer theme restyles the widgets already in it', () => {
    const root = new UIRoot();
    const widget = new ProbeWidget();

    root.addChild(widget);
    const layoutsBefore = widget.layouts;

    root.theme = red;

    expect(widget.theme).toBe(red);
    expect(widget.layouts).toBe(layoutsBefore + 1);
  });

  test('reaches widgets through a plain container in between', () => {
    const root = new UIRoot();
    const group = new Container();
    const widget = new ProbeWidget();

    group.addChild(widget);
    root.addChild(group);
    root.theme = red;

    expect(widget.theme).toBe(red);
  });

  test('a widget inherits from the nearest widget ancestor, not the layer', () => {
    const root = new UIRoot();
    const parent = new ProbeWidget();
    const child = new ProbeWidget();

    root.theme = red;
    root.addChild(parent);
    parent.addChild(child);
    parent.setTheme({ panel: { normal: { background: blue.panel.normal.background } } });

    expect(child.panelColor.toRgba8()).toBe(new Color(0, 0, 255, 1).toRgba8());
    expect(parent.themeOverrides).not.toBeNull();
  });

  test('overrides stay inside their subtree', () => {
    const root = new UIRoot();
    const overridden = new ProbeWidget();
    const sibling = new ProbeWidget();

    root.theme = red;
    root.addChild(overridden);
    root.addChild(sibling);
    overridden.setTheme({ panel: { normal: { background: blue.panel.normal.background } } });

    expect(sibling.theme).toBe(red);
  });

  test('clearing an override falls back to the inherited theme', () => {
    const root = new UIRoot();
    const widget = new ProbeWidget();

    root.theme = red;
    root.addChild(widget);
    widget.setTheme({ panel: { normal: { insets: { left: 4, top: 4, right: 4, bottom: 4 } } } });
    widget.setTheme(null);

    expect(widget.theme).toBe(red);
    expect(widget.themeOverrides).toBeNull();
  });

  test('reparenting re-resolves the inherited theme', () => {
    const first = new UIRoot();
    const second = new UIRoot();
    const widget = new ProbeWidget();

    first.theme = red;
    second.theme = blue;
    first.addChild(widget);
    second.addChild(widget);

    expect(widget.theme).toBe(blue);
  });

  test('an unchanged theme does not repaint', () => {
    const root = new UIRoot();
    const widget = new ProbeWidget();

    root.theme = red;
    root.addChild(widget);
    const layoutsBefore = widget.layouts;

    root.theme = red;
    widget._refreshTheme();

    expect(widget.layouts).toBe(layoutsBefore);
  });
});

describe('paint and layout invalidation', () => {
  test('a size change lays out and paints', () => {
    const widget = new ProbeWidget();

    widget.setSize(100, 50);

    expect(widget.layouts).toBe(1);
    expect(widget.paints).toBe(1);
  });

  test('an unchanged size does neither', () => {
    const widget = new ProbeWidget();

    widget.setSize(100, 50);
    widget.setSize(100, 50);

    expect(widget.layouts).toBe(1);
  });
});
