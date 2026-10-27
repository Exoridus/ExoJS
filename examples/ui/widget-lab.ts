import {
  Application,
  Button,
  Checkbox,
  Color,
  defaultUITheme,
  Dropdown,
  FixedResolutionCanvasSizing,
  Keyboard,
  Label,
  Panel,
  ProgressBar,
  Scene,
  ScrollContainer,
  Slider,
  Stack,
  Toggle,
  type Widget,
} from '@codexo/exojs';
import { siteUITheme, startExample } from '@examples/runtime';

const items = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];
// Neutral at low alpha so the rule reads on both light and dark theme surfaces.
const rule = new Color(128, 128, 128, 0.3);

const heading = (text: string): Label => new Label(text, { fontSize: 16, fontWeight: '600' });
const caption = (text: string): Label => new Label(text, { fontSize: 13 });

const createWidgets = () => {
  const button = new Button({ label: 'Clicked 0x', width: 200, height: 36 });
  const covered = new Button({ label: 'Covered 0x', width: 200, height: 36 });
  const rows = new Stack({ direction: 'column', spacing: 6, padding: 12 });

  return {
    button,
    checkbox: new Checkbox({ label: 'Enable shadows', size: 20 }),
    toggle: new Toggle({ label: 'Music', height: 28 }),
    slider: new Slider({ width: 240, height: 24, min: 0, max: 1, step: 0.05, value: 0.5 }),
    bar: new ProgressBar({ width: 240, height: 10, value: 0.5 }),
    dropdown: new Dropdown({ items, selectedIndex: 0, width: 200, height: 36 }),
    covered,
    scroll: new ScrollContainer({ width: 440, height: 300, scrollbars: 'auto' }),
    rows,
    clippedDropdown: new Dropdown({ items, width: 200, height: 36 }),
    add: new Button({ label: 'Add row', width: 120, height: 32 }),
    remove: new Button({ label: 'Remove row', width: 120, height: 32 }),
  };
};

type LabWidgets = ReturnType<typeof createWidgets>;

// Manual QA bench for the native UI widgets. The bench row changes layer-wide
// conditions (theme, disabled cascade, teardown); the lab below holds one
// live instance of each widget, and the status line reports resolved states.
class WidgetLabScene extends Scene {
  public readonly bench = {
    theme: new Toggle({ label: 'Site theme', height: 28, checked: true }),
    disable: new Toggle({ label: 'Disable lab', height: 28 }),
    teardown: new Button({ label: 'Destroy lab', width: 140, height: 32 }),
  };
  public widgets: LabWidgets | null = null;
  private lab: Panel | null = null;
  private status!: Label;

  override init(): void {
    const siteTheme = siteUITheme();
    const { theme, disable, teardown } = this.bench;
    this.ui.theme = siteTheme;
    // Claims Tab for UI focus traversal; unbound, the browser moves focus out of the canvas.
    this.inputs.onTrigger(Keyboard.Tab);
    theme.onChange.add(on => (this.ui.theme = on ? siteTheme : defaultUITheme));
    disable.onChange.add(off => {
      if (this.lab) {
        this.lab.enabled = !off;
      }
    });
    teardown.onClick.add(() => (this.lab ? this.destroyLab() : this.buildLab()));

    const backdrop = new Panel({ width: 1280, height: 720 });
    const title = new Label('Widget Lab', { fontSize: 22, fontWeight: '600' });
    title.setPosition(24, 22);
    const bench = new Stack({ direction: 'row', spacing: 20, padding: 0 });
    bench.addItem(theme);
    bench.addItem(disable);
    bench.addItem(teardown);
    bench.setPosition(1256 - bench.width, 20);
    this.status = caption('');
    this.status.setPosition(24, 686);
    this.ui.addChild(backdrop, title, bench, this.status);
    this.buildLab();
  }

  public states(): string {
    const w = this.widgets;

    if (!w) {
      return 'lab destroyed';
    }

    return [
      `button ${w.button.state}`,
      `checkbox ${w.checkbox.state} ${w.checkbox.checked}`,
      `toggle ${w.toggle.state} ${w.toggle.checked}`,
      `slider ${w.slider.state} ${w.slider.value.toFixed(2)}`,
      `dropdown ${w.dropdown.state} ${w.dropdown.isOpen ? 'open' : 'closed'} ${w.dropdown.selectedValue ?? '-'}`,
      `clipped ${w.clippedDropdown.isOpen ? 'open' : 'closed'}`,
      `scroll ${w.scroll.scrollY.toFixed(0)}`,
    ].join('   ');
  }

  private buildLab(): void {
    const w = createWidgets();
    const lab = new Panel({ width: 1232, height: 596, cornerRadius: 12, borderWidth: 1, borderColor: rule });
    lab.setPosition(24, 72);
    lab.enabled = !this.bench.disable.checked;

    let clicks = 0;
    let coveredClicks = 0;
    w.button.onClick.add(() => (w.button.label = `Clicked ${++clicks}x`));
    w.covered.onClick.add(() => (w.covered.label = `Covered ${++coveredClicks}x`));
    w.slider.onChange.add(value => (w.bar.value = value));

    const controls: Array<[string, Widget]> = [
      ['Button', w.button],
      ['Checkbox', w.checkbox],
      ['Toggle', w.toggle],
      ['Slider', w.slider],
      ['Progress', w.bar],
      ['Dropdown', w.dropdown],
      // Directly below the open list: a row pick must not reach it.
      ['Under popup', w.covered],
    ];
    const left = heading('Controls');
    left.setPosition(28, 24);
    lab.addChild(left);
    controls.forEach(([name, widget], index) => {
      const y = 72 + index * 64;
      const label = caption(name);
      label.setPosition(28, y + (36 - label.height) / 2);
      widget.setPosition(160, y + (36 - widget.height) / 2);
      lab.addChild(label, widget);
    });

    // Eight rows push the dropdown down so its open list crosses the viewport's lower edge.
    for (let row = 1; row <= 8; row++) {
      w.rows.addItem(caption(`Row ${row}`));
    }

    w.rows.addItem(w.clippedDropdown);
    w.scroll.content.addChild(w.rows);
    // A background makes the whole viewport hit-testable, so the wheel scrolls over empty space too.
    w.scroll.setBackground(new Color(128, 128, 128, 0.08));
    // The rows stack grows inside the content, which the container cannot observe.
    w.add.onClick.add(() => {
      w.rows.addItem(caption(`Row ${w.rows.children.length}`));
      w.scroll.refresh();
    });
    w.remove.onClick.add(() => {
      const last = w.rows.children[w.rows.children.length - 1];

      if (last !== undefined && w.rows.children.indexOf(last) > w.rows.children.indexOf(w.clippedDropdown)) {
        w.rows.removeItem(last);
        last.destroy();
        w.scroll.refresh();
      }
    });

    const right = new Stack({ direction: 'column', spacing: 14, padding: 0 });
    const actions = new Stack({ direction: 'row', spacing: 8, padding: 0 });
    actions.addItem(w.add);
    actions.addItem(w.remove);
    right.addItem(heading('Scrolling and clipping'));
    right.addItem(caption('The dropdown sits near the lower edge of the clipped viewport.'));
    right.addItem(actions);
    right.addItem(w.scroll);
    right.setPosition(620, 24);
    lab.addChild(right);

    const divider = new Panel({ width: 1, height: 548, color: rule });
    divider.setPosition(588, 24);
    lab.addChild(divider);

    this.ui.addChild(lab);
    this.lab = lab;
    this.widgets = w;
    this.bench.teardown.label = 'Destroy lab';
  }

  private destroyLab(): void {
    this.lab?.destroy();
    this.lab = null;
    this.widgets = null;
    this.bench.teardown.label = 'Rebuild lab';
  }

  override update(): void {
    this.status.text = this.states();
  }
}

const app = new Application({
  scenes: { WidgetLabScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(WidgetLabScene));
