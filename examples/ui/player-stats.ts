import {
  Application,
  bindProperty,
  Button,
  Color,
  FixedResolutionCanvasSizing,
  Label,
  live,
  Observable,
  ProgressBar,
  Scene,
  Stack,
} from '@codexo/exojs';
import { startExample } from '@examples/runtime';

// #region guide:player-stats
class PlayerStatsScene extends Scene {
  // One struct holds the state; the HUD below is bound to it once and never
  // updated by hand.
  private readonly player = Observable.struct({
    name: 'Hero',
    health: 100,
    stats: Observable.struct({ ammo: 30, level: 1 }),
  });

  override init(): void {
    const { health: hp, stats } = this.player;
    const hud = new Stack({ spacing: 12 });
    const level = new Label('', { fontSize: 26, fontWeight: '600' });
    const health = new ProgressBar({ width: 320, height: 14 });
    const summary = new Label('', { fontSize: 18 });
    const status = new Label('', { fontSize: 16 });
    const commands = new Stack({ direction: 'row', spacing: 8 });

    bindProperty(level, 'text', live`${this.player.name} | Level ${stats.level}`);
    bindProperty(
      health,
      'value',
      hp.map(value => value / 100),
    );
    bindProperty(summary, 'text', live`${hp} HP | ${stats.ammo} Ammo`);
    // A live template over both values changes whenever either does.
    bindProperty(
      status,
      'text',
      live`${hp} ${stats.ammo}`.map(() =>
        hp.value === 0 ? 'Down: level up to recover' : stats.ammo.value === 0 ? 'Out of ammo: reload' : 'Ready',
      ),
    );

    commands.addItem(
      this.command('Fire', () => {
        if (stats.ammo.value > 0 && hp.value > 0) {
          stats.ammo.value--;
        }
      }),
    );
    commands.addItem(this.command('Reload', () => (stats.ammo.value = 30)));
    commands.addItem(this.command('Take hit', () => (hp.value = Math.max(0, hp.value - 15))));
    // Several writes, one HUD update: every bound label is written once.
    commands.addItem(
      this.command('Level up', () =>
        Observable.batch(() => {
          stats.level.value++;
          stats.ammo.value = 30;
          hp.value = 100;
        }),
      ),
    );

    hud.addItem(level);
    hud.addItem(health);
    hud.addItem(summary);
    hud.addItem(status);
    hud.addItem(commands);
    hud.setPosition(64, 64);
    this.ui.addChild(hud);
  }

  private command(label: string, onClick: () => void): Button {
    const button = new Button({ label, width: 132, height: 40, fontSize: 14 });

    button.onClick.add(onClick);

    return button;
  }
}
// #endregion guide:player-stats

const app = new Application({
  scenes: { PlayerStatsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(12, 18, 26),
});

await startExample(app, () => app.start(PlayerStatsScene));
