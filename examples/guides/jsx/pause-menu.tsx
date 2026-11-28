import { Button, Keyboard, Label, Panel, Scene, Slider, Stack, Toggle } from '@codexo/exojs';
import type { JSX } from '@codexo/exojs/jsx';

// #region guide:pause-menu
interface AudioSettings {
  volume: number;
  muted: boolean;
}

class GameScene extends Scene {
  private readonly settings: AudioSettings = { volume: 0.8, muted: false };
  private menu: JSX.Element | null = null;

  override init(): void {
    this.inputs.onTrigger(Keyboard.Escape, () => (this.menu === null ? this.openPauseMenu() : this.closeMenu()));
  }

  private openPauseMenu(): void {
    this.app.scenes.pause();
    this.show(
      <Panel width={360} height={240} ref={panel => panel.anchorIn(this.ui, 'center')}>
        <Stack spacing={12} padding={24}>
          <Label text="Paused" style={{ fontSize: 32 }} />
          <Button label="Continue" onClick={() => this.closeMenu()} />
          <Button label="Settings" onClick={() => this.show(this.settingsMenu())} />
        </Stack>
      </Panel>,
    );
  }

  private settingsMenu(): JSX.Element {
    return (
      <Panel width={360} height={260} ref={panel => panel.anchorIn(this.ui, 'center')}>
        <Stack spacing={14} padding={24}>
          <Label text="Settings" style={{ fontSize: 28 }} />
          <Label text="Volume" />
          <Slider value={this.settings.volume} onChange={volume => (this.settings.volume = volume)} />
          <Toggle label="Mute" checked={this.settings.muted} onChange={muted => (this.settings.muted = muted)} />
          <Button label="Back" onClick={() => this.openPauseMenu()} />
        </Stack>
      </Panel>
    );
  }

  /** Replaces the open menu; destroying the old one releases its buttons and their handlers. */
  private show(menu: JSX.Element): void {
    this.menu?.destroy();
    this.menu = menu;
    this.ui.addChild(menu);
  }

  private closeMenu(): void {
    this.menu?.destroy();
    this.menu = null;
    this.app.scenes.resume();
  }
}
// #endregion guide:pause-menu

export { GameScene };
