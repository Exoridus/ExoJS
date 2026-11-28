import { Label, live, Observable, Panel, Scene, Stack } from '@codexo/exojs';

// #region guide:game-hud
class HudScene extends Scene {
  private readonly health = new Observable(100);
  private readonly ammo = new Observable(30);

  override init(): void {
    const { health, ammo } = this;

    this.ui.addChild(
      <Stack spacing={8} x={24} y={24}>
        <Label text={live`Health: ${health}`} />
        <Label text={live`Ammo: ${ammo} / 30`} />
        <Label text={health} />
        <Panel width={240} height={64} visible={health.map(n => n <= 0)}>
          <Label text="Game Over" />
        </Panel>
      </Stack>,
    );
  }

  public hit(damage: number): void {
    this.health.value = Math.max(0, this.health.value - damage);
  }

  public fire(): void {
    if (this.ammo.value > 0) {
      this.ammo.value--;
    }
  }
}
// #endregion guide:game-hud

export { HudScene };
