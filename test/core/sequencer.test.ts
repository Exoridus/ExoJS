import { tweenOperation } from '#animation/tweenOperation';
import { TweenSystem } from '#animation/TweenSystem';
import { TweenState } from '#animation/types';
import type { Application } from '#core/Application';
import { logger } from '#core/Logger';
import { Scene } from '#core/scene/Scene';
import { SceneScope } from '#core/scene/SceneScope';
import { SequenceCancelledError } from '#core/sequence/SequenceCancelledError';
import type { SequenceContext, SequenceGenerator } from '#core/sequence/SequenceContext';
import type { SequenceHandle } from '#core/sequence/SequenceHandle';
import type { SequenceOperation } from '#core/sequence/SequenceOperation';
import { Sequencer } from '#core/sequence/Sequencer';
import { Signal } from '#core/Signal';
import { type Seconds, seconds } from '#core/units';

const tick = (sequencer: Sequencer, count = 1, delta = 0.1): void => {
  for (let i = 0; i < count; i++) {
    sequencer.update(seconds(delta));
  }
};

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const createApp = (): Application =>
  ({
    loader: { _releaseScope: vi.fn() },
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn(), attachUIRoot: vi.fn(), detachUIRoot: vi.fn() },
    tweens: new TweenSystem(),
    onError: new Signal<[Error]>(),
  }) as unknown as Application;

/** A scene scope with a sequencer in its systems, prepared and optionally activated. */
const sceneWithSequencer = async (activate = true): Promise<{ scope: SceneScope<void>; sequencer: Sequencer }> => {
  const scope = new SceneScope<void>(createApp(), new Scene());
  const sequencer = scope.scene.systems.add(new Sequencer());

  await scope.prepare(undefined);

  if (activate) {
    scope.activate();
  }

  return { scope, sequencer };
};

/** Run `count` frames of the scope's update phase, which is where its systems tick. */
const frames = (scope: SceneScope<void>, count: number, delta = 0.1): void => {
  for (let i = 0; i < count; i++) {
    scope.update(seconds(delta));
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sequencer', () => {
  test('runs steps in order on its clock and completes with the sequence result', () => {
    const sequencer = new Sequencer();
    const log: string[] = [];

    const step = function* (context: SequenceContext): SequenceGenerator<string> {
      log.push('step');
      yield* context.wait(0.2);

      return 'stepped';
    };

    const run = sequencer.play(function* (context) {
      log.push(yield* step(context));
      yield* context.wait(0.3);
      log.push('waited');

      return 42;
    });

    expect(log).toEqual([]);

    tick(sequencer);
    expect(log).toEqual(['step']);

    tick(sequencer, 2);
    expect(log).toEqual(['step', 'stepped']);

    tick(sequencer, 2);
    expect(log).toEqual(['step', 'stepped']);

    tick(sequencer);
    expect(log).toEqual(['step', 'stepped', 'waited']);
    expect(run.status).toBe('completed');
    expect(run.result).toBe(42);
  });

  test('back-to-back waits keep to the clock instead of drifting a frame each', () => {
    const sequencer = new Sequencer();
    const run = sequencer.play(function* (context) {
      for (let i = 0; i < 4; i++) {
        yield* context.wait(0.25);
      }

      return context.time;
    });

    tick(sequencer, 10);
    expect(run.status).toBe('running');

    tick(sequencer);
    expect(run.status).toBe('completed');
    expect(run.result).toBeCloseTo(1, 9);
  });

  test('parallel branches keep their own residual time, and the result does not depend on branch order', () => {
    const trace = (reversed: boolean): string[][] => {
      const sequencer = new Sequencer();
      const events: string[] = [];

      const branch = (name: string, first: number) =>
        function* (context: SequenceContext): SequenceGenerator {
          yield* context.wait(first);
          events.push(`${name}@${round(context.time)}`);
          yield* context.wait(0.05);
          events.push(`${name}@${round(context.time)}`);
        };

      const branches = [branch('a', 0.02), branch('b', 0.08)];

      sequencer.play(function* (context) {
        yield* context.all(reversed ? [...branches].reverse() : branches);
        events.push(`join@${round(context.time)}`);
        yield* context.wait(0.07);
        events.push(`after@${round(context.time)}`);
      });

      const ticks: string[][] = [];

      for (let i = 0; i < 4; i++) {
        tick(sequencer);
        ticks.push(events.splice(0));
      }

      return ticks;
    };

    // a's second wait ends inside the same 0.1 s tick as its first; b's does not.
    // The join continues where the last branch ended.
    expect(trace(false)).toEqual([[], ['a@0.02', 'a@0.07', 'b@0.08'], ['b@0.13', 'join@0.13', 'after@0.2'], []]);
    expect(trace(true)).toEqual(trace(false));
  });

  test('zero and negative waits continue within the tick; non-finite durations throw at the yield', () => {
    const sequencer = new Sequencer();
    const events: string[] = [];

    sequencer.play(function* (context) {
      yield* context.wait(0);
      events.push('zero');
      yield* context.wait(-1);
      events.push('negative');

      for (const duration of [Number.NaN, Number.POSITIVE_INFINITY]) {
        try {
          yield* context.wait(duration);
        } catch (error) {
          events.push(`${duration}: ${(error as Error).message.includes('finite')}`);
        }
      }

      events.push(`time ${context.time}`);
    });

    tick(sequencer);
    expect(events).toEqual(['zero', 'negative', 'NaN: true', 'Infinity: true', 'time 0']);
  });

  test('a loop that never lets time pass fails after a bounded number of resumes, and the sequencer keeps running', () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const sequencer = new Sequencer();
    const runaway = sequencer.play(function* (context) {
      for (;;) {
        yield* context.wait(0);
      }
    });
    const healthy = sequencer.play(function* (context) {
      yield* context.wait(0.1);

      return 'fine';
    });

    tick(sequencer);
    expect(runaway.status).toBe('failed');
    expect((runaway.error as Error).message).toMatch(/1000 times within one tick/);
    expect(error).toHaveBeenCalledTimes(1);

    tick(sequencer);
    expect(healthy.result).toBe('fine');
  });

  test('a step resuming from a condition continues from that tick, not from time that passed before', () => {
    const sequencer = new Sequencer();
    const times: number[] = [];
    let ready = false;

    sequencer.play(function* (context) {
      yield* context.wait(0.03);
      times.push(round(context.time));
      yield* context.waitFor(() => ready);
      times.push(round(context.time));
      yield* context.wait(0.05);
      times.push(round(context.time));
    });

    tick(sequencer, 2);
    expect(times).toEqual([0.03]);

    ready = true;
    tick(sequencer);
    expect(times).toEqual([0.03, 0.2]);

    tick(sequencer);
    expect(times).toEqual([0.03, 0.2, 0.25]);
  });

  test('nextFrame returns the delta of the tick it resumes on', () => {
    const sequencer = new Sequencer();
    const run = sequencer.play(function* (context) {
      const first = yield* context.nextFrame();
      const second = yield* context.nextFrame();

      return [first, second];
    });

    sequencer.update(seconds(0.1));
    sequencer.update(seconds(0.25));
    sequencer.update(seconds(0.5));

    expect(run.result).toEqual([0.25, 0.5]);
  });

  test('all() waits for every branch; race() cancels the losers it started and keeps handles passed in', () => {
    const sequencer = new Sequencer();

    const timed = (duration: number, value: string) =>
      function* (context: SequenceContext): SequenceGenerator<string> {
        yield* context.wait(duration);

        return value;
      };

    let background: SequenceHandle<string> | null = null;
    let slow: SequenceHandle<string> | null = null;
    const run = sequencer.play(function* (context) {
      const both = yield* context.all([timed(0.1, 'a'), timed(0.3, 'b')]);

      background = context.start(timed(0.5, 'bg'));

      const first = yield* context.race([timed(0.1, 'fast'), timed(0.4, 'slow'), background]);

      slow = context.start(timed(0.05, 'after race'));
      expect(background.status).toBe('running');
      yield* context.waitFor(slow);

      return [...both, first];
    });

    tick(sequencer, 6);

    expect(run.status).toBe('completed');
    expect(run.result).toEqual(['a', 'b', 'fast']);
    // Owned by the run, so cancelled when it ended - but not by the race.
    expect(background!.status).toBe('cancelled');
    expect(slow!.status).toBe('completed');
  });

  test('a started branch can be joined through its handle while others keep running', () => {
    const sequencer = new Sequencer();
    const log: string[] = [];
    const run = sequencer.play(function* (context) {
      const music = context.start(function* (c) {
        yield* c.wait(1);
        log.push('music');
      });
      const shake = context.start(function* (c) {
        yield* c.wait(0.2);
        log.push('shake');
      });

      yield* context.waitFor(shake);
      log.push(`after shake, music ${music.status}`);
      yield* context.waitFor(music);
    });

    tick(sequencer, 3);
    expect(log).toEqual(['shake', 'after shake, music running']);

    tick(sequencer, 8);
    expect(log).toEqual(['shake', 'after shake, music running', 'music']);
    expect(run.status).toBe('completed');
  });

  test('cancel stops every step at once, runs finally blocks innermost first, and ignores late completions', async () => {
    const sequencer = new Sequencer();
    const log: string[] = [];
    let resolveExternal: (value: string) => void = () => {};
    const external = new Promise<string>(resolve => {
      resolveExternal = resolve;
    });
    let signal: AbortSignal | null = null;
    const run = sequencer.play(function* (context) {
      signal = context.signal;

      try {
        yield* context.all([
          function* (branch: SequenceContext): SequenceGenerator {
            try {
              yield* branch.wait(10);
            } finally {
              log.push('branch finally');
            }
          },
          (branch: SequenceContext) => branch.waitFor(external),
        ]);
        log.push('unreachable');
      } finally {
        log.push('finally');
      }
    });

    tick(sequencer, 2);
    run.cancel();

    expect(run.status).toBe('cancelled');
    expect(log).toEqual(['branch finally', 'finally']);
    expect(signal!.aborted).toBe(true);
    expect(signal!.reason).toBeInstanceOf(SequenceCancelledError);

    resolveExternal('late');
    await settle();
    tick(sequencer, 2);
    expect(log).toEqual(['branch finally', 'finally']);
    await expect(run.done).resolves.toEqual({ status: 'cancelled' });
  });

  test('a failing background branch is thrown into its owner, which can recover', () => {
    const sequencer = new Sequencer();
    const run = sequencer.play(function* (context) {
      context.start(function* (inner) {
        yield* inner.wait(0.1);

        throw new Error('boom');
      });

      try {
        yield* context.wait(5);
      } catch (error) {
        return `recovered from ${(error as Error).message}`;
      }

      return 'not reached';
    });

    tick(sequencer, 3);

    expect(run.result).toBe('recovered from boom');
  });

  test('an unobserved failing root is logged; one whose done was asked for is not', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const sequencer = new Sequencer();

    const failing = function* (context: SequenceContext): SequenceGenerator<string> {
      yield* context.wait(0.1);

      throw new Error('bad');
    };

    const unobserved = sequencer.play(failing);
    const observed = sequencer.play(failing);
    const completed = sequencer.play(function* (context) {
      yield* context.wait(0.1);

      return 'ok';
    });
    const outcomes = Promise.all([observed.done, completed.done]);

    tick(sequencer, 2);

    // Settled within the tick, before anything awaits the bridge.
    expect(unobserved.status).toBe('failed');
    expect(completed.status).toBe('completed');
    expect(error).toHaveBeenCalledTimes(1);
    await expect(outcomes).resolves.toEqual([
      { status: 'failed', error: expect.objectContaining({ message: 'bad' }) },
      { status: 'completed', value: 'ok' },
    ]);
  });

  test('yielding anything but a context wait, or playing a non-generator, fails the step', () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const sequencer = new Sequencer();
    const plainYield = sequencer.play(function* () {
      yield 5 as never;
    });
    const notGenerator = sequencer.play((() => 7) as never);

    tick(sequencer);

    expect(plainYield.error).toBeInstanceOf(TypeError);
    expect(notGenerator.error).toBeInstanceOf(TypeError);
  });

  test('each play is an independent run with its own time', () => {
    const sequencer = new Sequencer();

    const intro = function* (context: SequenceContext): SequenceGenerator<Seconds> {
      yield* context.wait(0.1);

      return context.time;
    };

    const first = sequencer.play(intro);

    tick(sequencer);

    const second = sequencer.play(intro);

    tick(sequencer);
    expect(first.status).toBe('completed');
    expect(second.status).toBe('running');

    tick(sequencer);
    expect(second.result).toBeCloseTo(0.1, 9);
  });

  test('resumes within a tick are ordered by their point on the clock, whatever the start order', () => {
    const sequencer = new Sequencer();
    const wakes: number[][] = [];
    let current: number[] = [];
    let seed = 7;

    const random = (): number => {
      seed = (seed * 16807) % 2147483647;

      return seed / 2147483647;
    };

    sequencer.play(function* (context) {
      const handles = Array.from({ length: 60 }, () =>
        context.start(function* (branch) {
          for (let i = 0; i < 4; i++) {
            yield* branch.wait(random() * 0.3);
            current.push(branch.time);
          }
        }),
      );

      yield* context.wait(0.05);
      // Cancelling some waiting branches takes them out of the queue wherever they are.
      handles.filter((_, index) => index % 7 === 0).forEach(handle => handle.cancel());
      yield* context.wait(10);
    });

    for (let i = 0; i < 20; i++) {
      tick(sequencer);
      wakes.push(current);
      current = [];
    }

    const all = wakes.flat();

    expect(all.length).toBeGreaterThan(150);
    expect(all).toEqual([...all].sort((a, b) => a - b));
  });

  test('a custom operation is polled once per tick from the tick after the wait, and cancelled once when it loses', () => {
    const sequencer = new Sequencer();
    const poll = vi.fn<SequenceOperation['poll']>(() => undefined);
    const cancel = vi.fn();

    sequencer.play(function* (context) {
      yield* context.race([(c: SequenceContext) => c.waitFor({ poll, cancel }), (c: SequenceContext) => c.wait(0.25)]);
    });

    tick(sequencer);
    expect(poll).not.toHaveBeenCalled();

    tick(sequencer, 2);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(cancel).not.toHaveBeenCalled();

    tick(sequencer);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(2);
  });
});

describe('Sequencer signal waits', () => {
  test('the listener is removed the moment the step is cancelled, without a dispatch', () => {
    const sequencer = new Sequencer();
    const signal = new Signal();
    const run = sequencer.play(function* (context) {
      yield* context.waitFor(signal);
    });

    tick(sequencer);
    expect(signal.count).toBe(1);

    run.cancel();
    expect(signal.count).toBe(0);
  });

  test('the listener is removed the moment the wait loses a race, without a dispatch', () => {
    const sequencer = new Sequencer();
    const signal = new Signal();

    sequencer.play(function* (context) {
      yield* context.race([(c: SequenceContext) => c.waitFor(signal), (c: SequenceContext) => c.wait(0.15)]);
      yield* context.wait(10);
    });

    tick(sequencer, 2);
    expect(signal.count).toBe(1);

    tick(sequencer);
    expect(signal.count).toBe(0);
  });

  test('a wait is one-shot: the listener is gone after the dispatch, and a nested dispatch does not overwrite the arguments', () => {
    const sequencer = new Sequencer();
    const signal = new Signal<[number]>();
    const run = sequencer.play(function* (context) {
      const [value] = yield* context.waitFor(signal);

      return value;
    });

    tick(sequencer);
    signal.add(value => {
      if (value === 1) {
        signal.dispatch(2);
      }
    });
    signal.dispatch(1);

    expect(signal.count).toBe(1);
    expect(run.status).toBe('running');

    tick(sequencer);
    expect(run.result).toBe(1);
  });

  test.each([
    ['before', true],
    ['after', false],
  ])('a dispatch that cancels the step from a listener registered %s the wait does not resume it', (_order, cancellerFirst) => {
    const sequencer = new Sequencer();
    const signal = new Signal();
    let resumed = false;
    let run: SequenceHandle | null = null;
    const canceller = (): void => run?.cancel();

    if (cancellerFirst) {
      signal.add(canceller);
    }

    run = sequencer.play(function* (context) {
      try {
        yield* context.waitFor(signal);
        resumed = true;
      } finally {
        // Dispatching from cleanup must not reach the abandoned wait either.
        signal.dispatch();
      }
    });

    tick(sequencer);

    if (!cancellerFirst) {
      signal.add(canceller);
    }

    signal.dispatch();
    expect(run.status).toBe('cancelled');
    expect(signal.count).toBe(1);

    tick(sequencer, 2);
    expect(resumed).toBe(false);
  });
});

describe('Sequencer availability in a scene', () => {
  test('a sequence played before the scene activates runs none of its code until the scene runs', async () => {
    const { scope, sequencer } = await sceneWithSequencer(false);
    const log: string[] = [];

    sequencer.play(function* (context) {
      log.push(`started at ${context.time}`);
      yield* context.wait(0.1);
      log.push('waited');
    });

    frames(scope, 3);
    expect(log).toEqual([]);

    scope.activate();
    frames(scope, 1);
    expect(log).toEqual(['started at 0']);

    frames(scope, 1);
    expect(log).toEqual(['started at 0', 'waited']);
  });

  test('a sequence played while the scene is paused starts on resume; a running one freezes with the scene', async () => {
    const { scope, sequencer } = await sceneWithSequencer();
    const running = sequencer.play(function* (context) {
      yield* context.wait(0.2);
    });

    frames(scope, 1);
    scope.pause();

    let started = false;
    const late = sequencer.play(function* (context) {
      started = true;
      yield* context.wait(0.1);
    });

    frames(scope, 5);
    expect(started).toBe(false);
    expect(running.status).toBe('running');

    scope.resume();
    frames(scope, 2);
    expect(started).toBe(true);
    expect(running.status).toBe('completed');
    expect(late.status).toBe('completed');
  });

  test('a retained scene holds its sequences, including one played while retained', async () => {
    const { scope, sequencer } = await sceneWithSequencer();
    const running = sequencer.play(function* (context) {
      yield* context.wait(0.2);
    });

    frames(scope, 1);
    scope.suspend();

    let started = false;

    sequencer.play(function* (context) {
      started = true;
      yield* context.wait(0);
    });
    frames(scope, 5);
    expect(started).toBe(false);
    expect(running.status).toBe('running');

    scope.restore();
    frames(scope, 2);
    expect(started).toBe(true);
    expect(running.status).toBe('completed');
  });

  test('ending the scene cancels its sequences, runs their cleanup and removes their signal listeners', async () => {
    const { scope, sequencer } = await sceneWithSequencer();
    const signal = new Signal();
    const log: string[] = [];
    const run = sequencer.play(function* (context) {
      try {
        yield* context.all([(c: SequenceContext) => c.waitFor(signal), (c: SequenceContext) => c.wait(5)]);
      } finally {
        log.push('cleanup');
      }
    });

    frames(scope, 1);
    expect(signal.count).toBe(1);

    await scope.destroy();
    expect(run.status).toBe('cancelled');
    expect(log).toEqual(['cleanup']);
    expect(signal.count).toBe(0);
  });

  test('removing the sequencer from its registry cancels its sequences', async () => {
    const { scope, sequencer } = await sceneWithSequencer();
    const run = sequencer.play(function* (context) {
      yield* context.wait(5);
    });

    frames(scope, 1);
    scope.scene.systems.remove(sequencer);
    expect(run.status).toBe('cancelled');
  });
});

describe('tweenOperation', () => {
  test('starts an idle tween and completes the wait when the tween completes', () => {
    const tweens = new TweenSystem();
    const sequencer = new Sequencer();
    const target = { x: 0 };
    const tween = tweens.create(target).to({ x: 10 }, 0.2);
    const run = sequencer.play(function* (context) {
      yield* context.waitFor(tweenOperation(tween));

      return target.x;
    });

    tick(sequencer);
    expect(tween.state).toBe(TweenState.Active);

    tweens.preFrame(seconds(0.25));
    tick(sequencer);
    expect(run.result).toBe(10);
  });

  test('a cancelled step stops its tween; a tween stopped elsewhere throws a cancellation into the step', () => {
    const tweens = new TweenSystem();
    const sequencer = new Sequencer();
    const owned = tweens.create({ x: 0 }).to({ x: 10 }, 1);
    const run = sequencer.play(function* (context) {
      yield* context.waitFor(tweenOperation(owned));
    });

    tick(sequencer);
    run.cancel();
    expect(owned.state).toBe(TweenState.Stopped);

    const external = tweens.create({ x: 0 }).to({ x: 10 }, 1);
    const observer = sequencer.play(function* (context) {
      try {
        yield* context.waitFor(tweenOperation(external));
      } catch (error) {
        return error instanceof SequenceCancelledError;
      }

      return false;
    });

    tick(sequencer);
    external.stop();
    tick(sequencer);
    expect(observer.result).toBe(true);
  });
});
