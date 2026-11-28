import {
  Application,
  bindProperty,
  Button,
  Color,
  FixedResolutionCanvasSizing,
  Label,
  live,
  Observable,
  Scene,
  Stack,
} from '@codexo/exojs';
import { startExample } from '@examples/runtime';

// #region guide:imperative-bindings
class CounterScene extends Scene {
  private readonly count = new Observable(0);

  override init(): void {
    const { count } = this;
    const layout = new Stack({ spacing: 16 });
    const value = new Label('', { fontSize: 40, fontWeight: '700' });
    const parity = new Label('', { fontSize: 18 });
    const buttons = new Stack({ direction: 'row', spacing: 8 });
    const reset = this.button('Reset', () => (count.value = 0));

    // Each binding writes through the property's own setter: value.text stays
    // a plain string, and reset.visible a plain boolean.
    bindProperty(value, 'text', live`Count: ${count}`);
    bindProperty(
      parity,
      'text',
      count.map(n => (n % 2 === 0 ? 'even' : 'odd')),
    );
    bindProperty(
      reset,
      'visible',
      count.map(n => n !== 0),
    );

    buttons.addItem(this.button('-1', () => count.value--));
    buttons.addItem(this.button('+1', () => count.value++));
    buttons.addItem(reset);
    layout.addItem(value);
    layout.addItem(parity);
    layout.addItem(buttons);
    layout.setPosition(64, 64);
    this.ui.addChild(layout);
  }

  private button(label: string, onClick: () => void): Button {
    const button = new Button({ label, width: 112, height: 44, fontSize: 16 });

    button.onClick.add(onClick);

    return button;
  }
}
// #endregion guide:imperative-bindings

const app = new Application({
  scenes: { CounterScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(12, 18, 26),
});

await startExample(app, () => app.start(CounterScene));
