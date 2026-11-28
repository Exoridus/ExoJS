import { TweenSystem } from '#animation/TweenSystem';
import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneScope } from '#core/scene/SceneScope';
import { isSequenceCancellation, Sequence, type SequenceContext } from '#core/sequence/Sequence';
import { Signal } from '#core/Signal';

const createApp = (): Application =>
  ({
    loader: { _releaseScope: vi.fn() },
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn(), attachUIRoot: vi.fn(), detachUIRoot: vi.fn() },
    tweens: new TweenSystem(),
    onError: new Signal<[Error]>(),
  }) as unknown as Application;

const activeScope = async (): Promise<SceneScope<void>> => {
  const scope = new SceneScope<void>(createApp(), new Scene());

  await scope.prepare(undefined);
  scope.activate();

  return scope;
};

/** Let every continuation queued by the last tick run - what happens between two real frames. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Advance the scene's clock by `count` frames of `delta`, letting continuations run after each. */
const frames = async (scope: SceneScope<void>, count: number, delta = 0.1): Promise<void> => {
  const app = scope.scene.app as unknown as { tweens: TweenSystem };

  for (let i = 0; i < count; i++) {
    app.tweens.preFrame(delta as never);
    await settle();
  }
};

describe('Sequence', () => {
  test('runs steps in order on the scene clock and resolves with the body result', async () => {
    const scope = await activeScope();
    const log: string[] = [];

    const step = async (context: SequenceContext): Promise<string> => {
      log.push('step');
      await context.wait(0.2);

      return 'stepped';
    };

    const run = new Sequence(async context => {
      log.push(await context.run(step));
      await context.wait(0.3);
      log.push('waited');

      return 42;
    }).start(scope.scene);

    await settle();
    expect(log).toEqual(['step']);

    await frames(scope, 2);
    expect(log).toEqual(['step', 'stepped']);

    await frames(scope, 2);
    expect(log).toEqual(['step', 'stepped']);

    await frames(scope, 1);
    expect(log).toEqual(['step', 'stepped', 'waited']);
    expect(run.status).toBe('completed');
    await expect(run).resolves.toBe(42);
  });

  test('back-to-back waits keep to the clock instead of drifting a frame each', async () => {
    const scope = await activeScope();
    const run = new Sequence(async context => {
      for (let i = 0; i < 4; i++) {
        await context.wait(0.25);
      }

      return context.time;
    }).start(scope.scene);

    await frames(scope, 10);

    expect(run.status).toBe('completed');
    expect(run.result).toBeCloseTo(1, 5);
  });

  test('all() waits for every step; race() cancels the losers it started and keeps handles passed in', async () => {
    const scope = await activeScope();

    const timed =
      (duration: number, value: string) =>
      async (context: SequenceContext): Promise<string> => {
        await context.wait(duration);

        return value;
      };

    let background: ReturnType<SequenceContext['start']> | null = null;
    let loser: ReturnType<SequenceContext['start']> | null = null;
    const run = new Sequence(async context => {
      const both = await context.all([timed(0.1, 'a'), timed(0.3, 'b')]);

      background = context.start(timed(0.5, 'bg'));
      loser = context.start(timed(0.5, 'loser'));

      const first = await context.race([timed(0.1, 'fast'), timed(0.4, 'slow'), background]);

      return [...both, first];
    }).start(scope.scene);

    await frames(scope, 3);
    await frames(scope, 1);

    expect(run.status).toBe('completed');
    expect(run.result).toEqual(['a', 'b', 'fast']);
    // Owned by the run, so cancelled when it ended - but not by the race.
    expect(background!.status).toBe('cancelled');
    expect(loser!.status).toBe('cancelled');
  });

  test('a started step can be awaited through its handle while others keep running', async () => {
    const scope = await activeScope();
    const log: string[] = [];
    const run = new Sequence(async context => {
      const music = context.start(async c => {
        await c.wait(1);
        log.push('music');
      });
      const shake = context.start(async c => {
        await c.wait(0.2);
        log.push('shake');
      });

      await shake;
      log.push(`after shake, music ${music.status}`);
      await music;
    }).start(scope.scene);

    await frames(scope, 3);
    expect(log).toEqual(['shake', 'after shake, music running']);

    await frames(scope, 8);
    expect(log).toEqual(['shake', 'after shake, music running', 'music']);
    expect(run.status).toBe('completed');
  });

  test('cancel stops every step at once, runs cleanups and finally blocks, and ignores late completions', async () => {
    const scope = await activeScope();
    const log: string[] = [];
    let resolveExternal: (value: string) => void = () => {};
    const external = new Promise<string>(resolve => {
      resolveExternal = resolve;
    });
    const run = new Sequence(async context => {
      context.defer(() => log.push('cleanup'));

      try {
        await context.all([context.wait(10), context.waitFor(external)].map(promise => () => promise));
        log.push('unreachable');
      } catch (error) {
        log.push(isSequenceCancellation(error) ? 'cancelled' : 'other');

        throw error;
      } finally {
        log.push('finally');
      }
    }).start(scope.scene);

    await frames(scope, 1);
    run.cancel();

    expect(run.status).toBe('cancelled');
    expect(log).toEqual(['cleanup']);

    await settle();
    expect(log).toEqual(['cleanup', 'cancelled', 'finally']);

    resolveExternal('late');
    await frames(scope, 2);
    expect(log).toEqual(['cleanup', 'cancelled', 'finally']);
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('the default policy freezes with the paused scene; an always sequence keeps going', async () => {
    const scope = await activeScope();
    const frozen = new Sequence(async c => c.wait(0.2)).start(scope.scene);
    const always = new Sequence(async c => c.wait(0.2), { when: SceneAvailability.Always }).start(scope.scene);

    scope.pause();
    await frames(scope, 3);

    expect(frozen.status).toBe('running');
    expect(always.status).toBe('completed');

    scope.resume();
    await frames(scope, 2);
    expect(frozen.status).toBe('completed');
  });

  test('signals and conditions are delivered on a tick, so they pause with the sequence', async () => {
    const scope = await activeScope();
    const confirm = new Signal<[string]>();
    let pressed = false;
    const run = new Sequence(async c => {
      const [who] = await c.waitFor(confirm);

      await c.waitUntil(() => pressed);

      return who;
    }).start(scope.scene);

    await settle();
    scope.pause();
    confirm.dispatch('player');
    await frames(scope, 2);
    expect(run.status).toBe('running');

    scope.resume();
    await frames(scope, 1);
    pressed = true;
    await frames(scope, 1);

    expect(run.result).toBe('player');
    expect(confirm.count).toBe(0);
  });

  test('a retained scene holds its runs; ending the scene cancels them', async () => {
    const scope = await activeScope();
    const run = new Sequence(async c => c.wait(0.2)).start(scope.scene);

    scope.suspend();
    await frames(scope, 5);
    expect(run.status).toBe('running');

    scope.restore();
    await frames(scope, 1);
    expect(run.status).toBe('running');

    await scope.destroy();
    expect(run.status).toBe('cancelled');
  });

  test('an unawaited failing background step fails its owner', async () => {
    const scope = await activeScope();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = new Sequence(async c => {
      c.start(async inner => {
        await inner.wait(0.1);

        throw new Error('boom');
      });
      await c.wait(5);
    }).start(scope.scene);

    await frames(scope, 2);

    expect(run.status).toBe('failed');
    expect((run.error as Error).message).toBe('boom');
    error.mockRestore();
  });

  test('each start is an independent run that leaves no ticker behind', async () => {
    const scope = await activeScope();
    const intro = new Sequence(async c => {
      await c.wait(0.1);

      return c.time;
    });
    const first = intro.start(scope.scene);
    const lane = (scope.tweens as unknown as { _lanes: Map<SceneAvailability, { system: { _tickers: unknown[] } }> })._lanes.get(
      SceneAvailability.Active,
    )!;

    await frames(scope, 1);

    const second = intro.start(scope.scene);

    expect(lane.system._tickers).toHaveLength(1);
    await frames(scope, 1);

    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    expect(second.result).toBeCloseTo(0.1, 5);
    expect(lane.system._tickers).toHaveLength(0);
  });
});
