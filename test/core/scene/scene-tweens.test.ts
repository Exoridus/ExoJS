import { Tween } from '#animation/Tween';
import { TweenSequencer } from '#animation/TweenSequencer';
import { TweenSystem } from '#animation/TweenSystem';
import { TweenState } from '#animation/types';
import type { Application } from '#core/Application';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneState } from '#core/scene/SceneState';
import { SceneTweens } from '#core/scene/SceneTweens';
import { type Seconds, Time } from '#core/units';

// Unit level: SceneTweens against a real application-wide TweenSystem, with
// the scope's state and pause flag driven by hand. The end-to-end policy
// matrix through a real Application lives in scene-availability.test.ts.

const sec = (seconds: number): Seconds => Time.seconds(seconds);
const tickerCount = (system: TweenSystem): number => (system as unknown as { _tickers: unknown[] })._tickers.length;
const tweenCount = (system: TweenSystem): number => (system as unknown as { _tweens: unknown[] })._tweens.length;

interface Fixture {
  system: TweenSystem;
  tweens: SceneTweens;
  setState(state: SceneState): void;
  setPaused(paused: boolean): void;
}

const fixture = (state: SceneState = SceneState.Active): Fixture => {
  const system = new TweenSystem();
  let current = state;
  let paused = false;
  const tweens = new SceneTweens(
    { tweens: system } as unknown as Application,
    () => current,
    () => paused,
  );

  if (state === SceneState.Active) {
    tweens.activate();
  }

  return {
    system,
    tweens,
    setState: next => {
      current = next;
    },
    setPaused: next => {
      paused = next;
    },
  };
};

describe('SceneTweens', () => {
  test('create() returns a tween the application-wide system drives through the scene', () => {
    const { system, tweens } = fixture();
    const target = { x: 0 };

    const tween = tweens.create(target).to({ x: 100 }, 1).start();

    expect(tween).toBeInstanceOf(Tween);
    expect(tweenCount(system)).toBe(0);

    system.preFrame(sec(0.5));

    expect(target.x).toBeCloseTo(50, 5);
  });

  test('add() takes a running tween out of the application-wide system and under the scene', () => {
    const { system, tweens, setPaused } = fixture();
    const target = { x: 0 };
    const tween = system.create(target).to({ x: 100 }, 1).start();

    tweens.add(tween, { when: SceneAvailability.Active });
    setPaused(true);
    system.preFrame(sec(0.5));

    expect(tweenCount(system)).toBe(0);
    expect(target.x).toBe(0);
    expect(tween.state).toBe(TweenState.Active);
  });

  test('add() again moves a tracked tween to the new policy instead of running it twice', () => {
    const { system, tweens, setPaused } = fixture();
    const target = { x: 0 };
    const tween = tweens.create(target, { when: SceneAvailability.Active }).to({ x: 100 }, 1).start();

    tweens.add(tween, { when: SceneAvailability.Always });
    system.preFrame(sec(0.25));

    expect(target.x).toBeCloseTo(25, 5);

    setPaused(true);
    system.preFrame(sec(0.25));

    expect(target.x).toBeCloseTo(50, 5);
  });

  test('clearing the application-wide system stops scene tweens and leaves the scene able to run new ones', () => {
    const { system, tweens } = fixture();
    const stopped = tweens.create({ x: 0 }).to({ x: 100 }, 1).start();

    system.clear();

    expect(stopped.state).toBe(TweenState.Stopped);

    const target = { x: 0 };

    tweens.create(target).to({ x: 100 }, 1).start();
    system.preFrame(sec(0.5));

    expect(target.x).toBeCloseTo(50, 5);
  });

  test('createSequencer() returns a sequencer whose stages run under its policy', () => {
    const { system, tweens, setPaused } = fixture();
    const target = { x: 0 };
    const sequencer = tweens.createSequencer({ when: SceneAvailability.Paused });

    expect(sequencer).toBeInstanceOf(TweenSequencer);

    sequencer.then(new Tween(target).to({ x: 100 }, 1)).start();
    system.preFrame(sec(0.5));

    expect(target.x).toBe(0);

    setPaused(true);
    system.preFrame(sec(0.5));

    expect(target.x).toBeCloseTo(50, 5);
  });

  test('a tween chained from a tracked one runs under the same policy', () => {
    const { system, tweens, setPaused } = fixture();
    const first = { x: 0 };
    const second = { x: 0 };
    const head = tweens.create(first, { when: SceneAvailability.Active }).to({ x: 1 }, 0.1);

    head.chain(tweens.create(second, { when: SceneAvailability.Active }).to({ x: 100 }, 1));
    head.start();
    system.preFrame(sec(0.2));
    setPaused(true);
    system.preFrame(sec(0.5));

    expect(second.x).toBe(0);
  });

  test('destroy() stops every tracked tween and sequencer and detaches from the application-wide system', () => {
    const { system, tweens } = fixture();
    const tween = tweens.create({ x: 0 }).to({ x: 100 }, 1).start();
    const sequencer = tweens.createSequencer({ when: SceneAvailability.Active });

    sequencer.then(new Tween({ x: 0 }).to({ x: 1 }, 1)).start();

    expect(tickerCount(system)).toBe(2);

    tweens.destroy();

    expect(tween.state).toBe(TweenState.Stopped);
    expect(sequencer.state).toBe('stopped');
    expect(tickerCount(system)).toBe(0);
  });
});

describe('SceneTweens — policy gate', () => {
  test.each([
    [SceneAvailability.Always, false, true],
    [SceneAvailability.Always, true, true],
    [SceneAvailability.Active, false, true],
    [SceneAvailability.Active, true, false],
    [SceneAvailability.Paused, false, false],
    [SceneAvailability.Paused, true, true],
  ] as const)("'%s' with the scene paused=%s advances: %s", (when, paused, advances) => {
    const { system, tweens, setPaused } = fixture();
    const target = { x: 0 };

    setPaused(paused);
    tweens.create(target, { when }).to({ x: 100 }, 1).start();
    system.preFrame(sec(0.5));

    expect(target.x > 0).toBe(advances);
  });

  test.each([SceneState.Suspended, SceneState.Destroying] as const)(
    'nothing advances while the scope is %s, not even under always',
    state => {
      const { system, tweens, setState } = fixture();
      const target = { x: 0 };

      tweens.create(target).to({ x: 100 }, 1).start();
      setState(state);
      system.preFrame(sec(0.5));

      expect(target.x).toBe(0);
    },
  );

  test("the scene never changes a tween's own state", () => {
    const { system, tweens, setPaused } = fixture();
    const running = tweens.create({ x: 0 }, { when: SceneAvailability.Active }).to({ x: 100 }, 1).start();
    const paused = tweens.create({ x: 0 }, { when: SceneAvailability.Active }).to({ x: 100 }, 1).start().pause();

    setPaused(true);
    system.preFrame(sec(0.5));
    setPaused(false);
    system.preFrame(sec(0.5));

    expect(running.state).toBe(TweenState.Active);
    expect(paused.state).toBe(TweenState.Paused);
  });
});

describe('SceneTweens — before the first activation', () => {
  test('a tween started while the scope prepares produces no application-wide effect', () => {
    const { system, tweens } = fixture(SceneState.Ready);
    const target = { x: 0 };

    tweens.create(target).to({ x: 100 }, 1).start();
    tweens.createSequencer().start();
    system.preFrame(sec(0.5));

    expect(tickerCount(system)).toBe(0);
    expect(tweenCount(system)).toBe(0);
    expect(target.x).toBe(0);
  });

  test('activation hands every lane to the application-wide system once, started tweens included', () => {
    const { system, tweens, setState } = fixture(SceneState.Ready);
    const target = { x: 0 };

    tweens.create(target).to({ x: 100 }, 1).start();
    tweens.create({ x: 0 }, { when: SceneAvailability.Active });
    setState(SceneState.Active);
    tweens.activate();
    tweens.activate();

    expect(tickerCount(system)).toBe(2);

    system.preFrame(sec(0.5));

    expect(target.x).toBeCloseTo(50, 5);
  });

  test('a lane first used after activation joins the application-wide system at once', () => {
    const { system, tweens } = fixture();

    tweens.create({ x: 0 }, { when: SceneAvailability.Paused });

    expect(tickerCount(system)).toBe(1);
  });

  test('a scope destroyed before it ever activated never touches the application-wide system', () => {
    const { system, tweens } = fixture(SceneState.Ready);
    const tween = tweens.create({ x: 0 }).to({ x: 100 }, 1).start();

    tweens.destroy();
    tweens.activate();

    expect(tween.state).toBe(TweenState.Stopped);
    expect(tickerCount(system)).toBe(0);
  });
});
