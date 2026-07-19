import { DisposalScope } from '#core/DisposalScope';
import { Scene } from '#core/Scene';
import type { Destroyable } from '#core/types';

// A Destroyable that records the order in which it is torn down. `__DEV__` is
// `true` under vitest (see vitest.config.ts `define`), so DisposalScope rethrows
// collected destroy errors as an AggregateError.

class Tracker implements Destroyable {
  public destroyed = false;

  public constructor(
    public readonly name: string,
    private readonly _log: string[],
    private readonly _throwOnDestroy = false,
  ) {}

  public destroy(): void {
    this.destroyed = true;
    this._log.push(this.name);

    if (this._throwOnDestroy) {
      throw new Error(`destroy failed: ${this.name}`);
    }
  }
}

describe('DisposalScope', () => {
  test('track returns its argument and is idempotent', () => {
    const scope = new DisposalScope();
    const log: string[] = [];
    const a = new Tracker('a', log);

    expect(scope.track(a)).toBe(a);
    scope.track(a); // duplicate registration

    expect(scope.size).toBe(1);
    expect(scope.has(a)).toBe(true);

    scope.destroy();
    expect(log).toEqual(['a']); // destroyed exactly once
  });

  test('destroy tears down in reverse registration order', () => {
    const scope = new DisposalScope();
    const log: string[] = [];
    scope.track(new Tracker('a', log));
    scope.track(new Tracker('b', log));
    scope.track(new Tracker('c', log));

    scope.destroy();

    expect(log).toEqual(['c', 'b', 'a']);
  });

  test('destroy is idempotent', () => {
    const scope = new DisposalScope();
    const log: string[] = [];
    scope.track(new Tracker('a', log));

    scope.destroy();
    scope.destroy();

    expect(log).toEqual(['a']);
    expect(scope.disposed).toBe(true);
    expect(scope.size).toBe(0);
  });

  test('untrack removes an item so it is not destroyed', () => {
    const scope = new DisposalScope();
    const log: string[] = [];
    const a = new Tracker('a', log);
    const b = new Tracker('b', log);
    scope.track(a);
    scope.track(b);

    expect(scope.untrack(a)).toBe(true);
    expect(scope.untrack(a)).toBe(false); // already removed
    expect(scope.has(a)).toBe(false);

    scope.destroy();

    expect(a.destroyed).toBe(false);
    expect(b.destroyed).toBe(true);
    expect(log).toEqual(['b']);
  });

  test('track after dispose is a no-op', () => {
    const scope = new DisposalScope();
    const log: string[] = [];
    scope.destroy();

    const late = new Tracker('late', log);
    expect(scope.track(late)).toBe(late);
    expect(scope.has(late)).toBe(false);
    expect(late.destroyed).toBe(false);
  });

  test('destroy attempts every item even when one throws, then rethrows in dev', () => {
    const scope = new DisposalScope();
    const log: string[] = [];
    const a = new Tracker('a', log);
    const b = new Tracker('b', log, true); // throws on destroy
    const c = new Tracker('c', log);
    scope.track(a);
    scope.track(b);
    scope.track(c);

    expect(() => scope.destroy()).toThrow(AggregateError);

    // Reverse order, and every item was attempted despite b throwing.
    expect(log).toEqual(['c', 'b', 'a']);
    expect(a.destroyed).toBe(true);
    expect(c.destroyed).toBe(true);
  });
});

describe('Scene — ownership via track()', () => {
  // Scene.destroy() is a pure user hook (definition §5.7) — tracked-resource
  // disposal is engine-owned teardown, run by SceneScope via
  // Scene._teardownInternals() (see scene-scope.test.ts for the full
  // permanent-teardown sequence this participates in).
  test('_teardownInternals() disposes resources tracked via track()', () => {
    const scene = new Scene();
    const log: string[] = [];
    const resource = scene.track(new Tracker('resource', log));

    expect(scene.track(resource)).toBe(resource); // fluent + idempotent

    scene.destroy(); // user hook — no infrastructure side effect
    expect(resource.destroyed).toBe(false);

    scene._teardownInternals();

    expect(resource.destroyed).toBe(true);
    expect(log).toEqual(['resource']);
  });
});
