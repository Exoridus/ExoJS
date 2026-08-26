import { Button, Keyboard, Label, Panel, ProgressBar, Scene, ScrollContainer, Stack, Tooltip } from '@codexo/exojs';

// #region guide:anchoring
class HudScene extends Scene {
  override init(): void {
    const score = new Label('Score: 0', { fontSize: 24 });
    score.anchorIn(this.ui, 'top-left', 24, 20); // top-left, 24x20 px margin
    this.ui.addChild(score);

    const health = new ProgressBar({ width: 240, height: 14, value: 1 });
    health.anchorIn(this.ui, 'bottom-right', -24, -24); // 24 px from the bottom-right
    this.ui.addChild(health);
  }
}
// #endregion guide:anchoring

// #region guide:stack
class MenuScene extends Scene {
  override init(): void {
    const menu = new Stack({ direction: 'column', spacing: 10, padding: 14 });
    menu.addItem(new Button({ label: 'Resume' }));
    menu.addItem(new Button({ label: 'Restart' }));
    menu.addItem(new Button({ label: 'Quit' }));

    const panel = new Panel();
    panel.setSize(menu.uiWidth, menu.uiHeight);
    panel.addChild(menu);
    panel.anchorIn(this.ui, 'center');
    this.ui.addChild(panel);
  }
}
// #endregion guide:stack

// #region guide:scrolling
class InventoryScene extends Scene {
  override init(): void {
    const scroll = new ScrollContainer({ width: 280, height: 320, direction: 'vertical' });
    scroll.anchorIn(this.ui, 'center');

    for (let i = 0; i < 20; i++) {
      const item = new Label(`Item ${i}`, { fontSize: 16 });
      item.setPosition(12, i * 28);
      scroll.content.addChild(item);
    }

    this.ui.addChild(scroll);
  }
}
// #endregion guide:scrolling

// #region guide:focus
class FormScene extends Scene {
  override init(): void {
    const field = new Button({ label: 'Name' });
    field.focusable = true;
    field.tabIndex = 1; // lower values are visited first
    field.onFocus.add(() => {
      /* highlight */
    });
    field.onKeyDown.add(event => {
      if (event.channel === Keyboard.Enter) {
        /* submit */
      }
    });

    this.ui.addChild(field);
  }
}
// #endregion guide:focus

// #region guide:tooltip
class ShopScene extends Scene {
  private tooltip!: Tooltip;

  override init(): void {
    const upgrade = new Button({ label: 'Upgrade', width: 160, height: 44 });
    upgrade.interactive = true;
    upgrade.anchorIn(this.ui, 'top-left', 24, 20);
    this.ui.addChild(upgrade);

    this.tooltip = new Tooltip(upgrade, { text: 'Costs 50 gold', delay: 0.3 });
  }
}
// #endregion guide:tooltip

export { FormScene, HudScene, InventoryScene, MenuScene, ShopScene };
