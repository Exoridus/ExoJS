import {
  Application,
  Button,
  Checkbox,
  Color,
  defaultUITheme,
  Dropdown,
  FixedResolutionCanvasSizing,
  Label,
  Panel,
  ProgressBar,
  Scene,
  ScrollContainer,
  Slider,
  Stack,
  Toggle,
} from '@codexo/exojs';
import { siteUITheme, startExample } from '@examples/runtime';

const items = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];
const muted = new Color(150, 160, 175);

// Manual QA bench for the native UI widgets. Every control either changes a
// widget state or exercises a layer-wide concern (theme, cascade, teardown);
// the readout shows each widget's resolved state.
class WidgetLabScene extends Scene {
  private lab: Panel | null = null;
  private readout!: Label;
  private states: () => string = () => '';

  override init(): void {
    const siteTheme = siteUITheme();
    this.ui.theme = siteTheme;

    const bench = new Stack({ direction: 'row', spacing: 12, padding: 0 });
    const theme = new Toggle({ label: 'Site theme', height: 28, checked: true });
    const disableAll = new Toggle({ label: 'Disable lab', height: 28 });
    const teardown = new Button({ label: 'Destroy lab', width: 150, height: 28 });
    theme.onChange.add(on => (this.ui.theme = on ? siteTheme : defaultUITheme));
    disableAll.onChange.add(off => this.lab && (this.lab.enabled = !off));
    teardown.onClick.add(() => {
      if (this.lab) {
        this.destroyLab();
        teardown.label = 'Rebuild lab';
      } else {
        this.buildLab(!disableAll.checked);
        teardown.label = 'Destroy lab';
      }
    });
    bench.addItem(theme);
    bench.addItem(disableAll);
    bench.addItem(teardown);
    bench.setPosition(24, 20);
    this.ui.addChild(bench);

    this.readout = new Label('', { fontSize: 13, fillColor: muted });
    this.readout.setPosition(24, 680);
    this.ui.addChild(this.readout);

    this.buildLab(true);
  }

  private buildLab(enabled: boolean): void {
    const lab = new Panel({ width: 1232, height: 600, color: new Color(22, 27, 34), cornerRadius: 10 });
    lab.setPosition(24, 64);
    lab.enabled = enabled;

    const controls = new Stack({ direction: 'column', spacing: 12, padding: 16 });
    const button = new Button({ label: 'Clicked 0x', width: 200, height: 36 });
    let clicks = 0;
    button.onClick.add(() => (button.label = `Clicked ${++clicks}x`));
    const checkbox = new Checkbox({ label: 'Checkbox', size: 20 });
    const toggle = new Toggle({ label: 'Toggle', height: 28 });
    const slider = new Slider({ width: 280, height: 24, min: 0, max: 1, step: 0.05, value: 0.5 });
    const bar = new ProgressBar({ width: 280, height: 12, value: 0.5 });
    slider.onChange.add(value => (bar.value = value));
    const dropdown = new Dropdown({ items, selectedIndex: 1, width: 200, height: 32 });
    // Opens over the button below it: the list must stack above later siblings.
    const underDropdown = new Button({ label: 'Covered by open list', width: 200, height: 36 });
    controls.addItem(new Label('Controls', { fontSize: 16, fillColor: Color.white }));

    for (const widget of [button, checkbox, toggle, slider, bar, dropdown, underDropdown]) {
      controls.addItem(widget);
    }

    controls.setPosition(0, 0);
    lab.addChild(controls);

    const scroll = new ScrollContainer({ width: 520, height: 300, scrollbars: 'auto' });
    const rows = new Stack({ direction: 'column', spacing: 6, padding: 8 });
    // Inside the clipped viewport: shows whether an open list escapes the clip.
    const clippedDropdown = new Dropdown({ items, width: 200, height: 32 });
    rows.addItem(clippedDropdown);
    scroll.content.addChild(rows);

    const add = new Button({ label: 'Add row', width: 120, height: 30 });
    const remove = new Button({ label: 'Remove row', width: 120, height: 30 });
    add.onClick.add(() => rows.addItem(new Label(`Row ${rows.children.length}`, { fontSize: 14, fillColor: Color.white })));
    remove.onClick.add(() => {
      const last = rows.children[rows.children.length - 1];

      if (last !== undefined && last !== clippedDropdown) {
        rows.removeItem(last);
        last.destroy();
      }
    });

    const layout = new Stack({ direction: 'column', spacing: 12, padding: 16 });
    const rowButtons = new Stack({ direction: 'row', spacing: 8, padding: 0 });
    rowButtons.addItem(add);
    rowButtons.addItem(remove);
    layout.addItem(new Label('Scroll, clip and dynamic layout', { fontSize: 16, fillColor: Color.white }));
    layout.addItem(rowButtons);
    layout.addItem(scroll);
    layout.setPosition(560, 0);
    lab.addChild(layout);

    this.ui.addChild(lab);
    this.lab = lab;
    this.states = () =>
      [
        `button ${button.state}`,
        `checkbox ${checkbox.state} ${checkbox.checked}`,
        `toggle ${toggle.state} ${toggle.checked}`,
        `slider ${slider.state} ${slider.value.toFixed(2)}`,
        `dropdown ${dropdown.state} ${dropdown.isOpen ? 'open' : 'closed'} ${dropdown.selectedValue ?? '-'}`,
        `scroll y ${scroll.scrollY.toFixed(0)}`,
      ].join('  |  ');
  }

  private destroyLab(): void {
    this.lab?.destroy();
    this.lab = null;
    this.states = () => 'lab destroyed';
  }

  override update(): void {
    this.readout.text = this.states();
  }
}

const app = new Application({
  scenes: { WidgetLabScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(WidgetLabScene));
