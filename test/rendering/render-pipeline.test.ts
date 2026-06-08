import type { RenderingContext } from '@/rendering/RenderingContext';
import { RenderPass } from '@/rendering/RenderPass';
import { RenderPipeline } from '@/rendering/RenderPipeline';

const ctx = {} as RenderingContext;

interface TestPassOptions {
  readonly label?: string;
  readonly enabled?: boolean;
  readonly onExecute?: () => void;
  readonly onDestroy?: () => void;
}

class TestPass extends RenderPass {
  public readonly executions: RenderingContext[] = [];
  public readonly resizes: [number, number][] = [];
  public destroyCount = 0;
  private readonly _onExecute?: () => void;
  private readonly _onDestroy?: () => void;

  public constructor(options: TestPassOptions = {}) {
    super({ label: options.label, enabled: options.enabled });
    this._onExecute = options.onExecute;
    this._onDestroy = options.onDestroy;
  }

  public override execute(context: RenderingContext): void {
    this.executions.push(context);
    this._onExecute?.();
  }

  public override resize(width: number, height: number): void {
    this.resizes.push([width, height]);
  }

  public override destroy(): void {
    this.destroyCount++;
    this._onDestroy?.();
  }
}

describe('RenderPass (base)', () => {
  test('enabled defaults to true and can be set via options', () => {
    expect(new TestPass().enabled).toBe(true);
    expect(new TestPass({ enabled: false }).enabled).toBe(false);
  });

  test('label defaults to the constructor name and can be set via options', () => {
    expect(new TestPass().label).toBe('TestPass');
    expect(new TestPass({ label: 'world' }).label).toBe('world');
    expect(new RenderPipeline().label).toBe('RenderPipeline');
  });

  test('resize and destroy are no-ops by default', () => {
    const pass = new (class extends RenderPass {
      public override execute(): void {
        // no-op
      }
    })();

    expect(() => pass.resize(10, 20)).not.toThrow();
    expect(() => pass.destroy()).not.toThrow();
  });

  test('a direct execute() call runs the pass regardless of enabled', () => {
    const pass = new TestPass({ enabled: false });

    pass.execute(ctx);

    expect(pass.executions).toHaveLength(1);
  });
});

describe('RenderPipeline', () => {
  // 1
  test('plays passes in registration order', () => {
    const order: string[] = [];
    const a = new TestPass({ onExecute: () => order.push('a') });
    const b = new TestPass({ onExecute: () => order.push('b') });
    const c = new TestPass({ onExecute: () => order.push('c') });

    new RenderPipeline().addPass(a).addPass(b).addPass(c).execute(ctx);

    expect(order).toEqual(['a', 'b', 'c']);
  });

  // 2
  test('skips a disabled child pass', () => {
    const a = new TestPass();
    const b = new TestPass({ enabled: false });

    new RenderPipeline().addPass(a).addPass(b).execute(ctx);

    expect(a.executions).toHaveLength(1);
    expect(b.executions).toHaveLength(0);
  });

  // 3
  test('a directly-executed child ignores its enabled flag', () => {
    const b = new TestPass({ enabled: false });

    new RenderPipeline().addPass(b);
    b.execute(ctx);

    expect(b.executions).toHaveLength(1);
  });

  // 4
  test('a disabled pipeline skips its whole subtree', () => {
    const a = new TestPass();
    const inner = new RenderPipeline().addPass(a);
    inner.enabled = false;

    new RenderPipeline().addPass(inner).execute(ctx);
    inner.execute(ctx);

    expect(a.executions).toHaveLength(0);
  });

  // 5
  test('insertPass clamps the index to [0, size]', () => {
    const a = new TestPass({ label: 'a' });
    const b = new TestPass({ label: 'b' });
    const c = new TestPass({ label: 'c' });
    const d = new TestPass({ label: 'd' });
    const pipeline = new RenderPipeline().addPass(a).addPass(b);

    pipeline.insertPass(c, -5); // clamps to 0
    pipeline.insertPass(d, 999); // clamps to size

    expect([...pipeline].map(p => p.label)).toEqual(['c', 'a', 'b', 'd']);
  });

  // 6
  test('removePass returns true when present, false when absent', () => {
    const a = new TestPass();
    const b = new TestPass();
    const pipeline = new RenderPipeline().addPass(a);

    expect(pipeline.removePass(a)).toBe(true);
    expect(pipeline.removePass(b)).toBe(false);
    expect(pipeline.size).toBe(0);
  });

  // 7
  test('clear removes passes without destroying them', () => {
    const a = new TestPass();
    const b = new TestPass();
    const pipeline = new RenderPipeline().addPass(a).addPass(b);

    pipeline.clear();

    expect(pipeline.size).toBe(0);
    expect(a.destroyCount).toBe(0);
    expect(b.destroyCount).toBe(0);
  });

  // 8
  test('iterates passes in play order', () => {
    const a = new TestPass({ label: 'a' });
    const b = new TestPass({ label: 'b' });
    const pipeline = new RenderPipeline().addPass(a).addPass(b);

    expect([...pipeline]).toEqual([a, b]);
  });

  // 9
  test('size / hasPass / indexOf / at reflect the contents', () => {
    const a = new TestPass();
    const b = new TestPass();
    const absent = new TestPass();
    const pipeline = new RenderPipeline().addPass(a).addPass(b);

    expect(pipeline.size).toBe(2);
    expect(pipeline.hasPass(a)).toBe(true);
    expect(pipeline.hasPass(absent)).toBe(false);
    expect(pipeline.indexOf(b)).toBe(1);
    expect(pipeline.indexOf(absent)).toBe(-1);
    expect(pipeline.at(0)).toBe(a);
    expect(pipeline.at(5)).toBeUndefined();
  });

  // 10
  test('adding the same pass twice to the same pipeline throws', () => {
    const a = new TestPass();
    const pipeline = new RenderPipeline().addPass(a);

    expect(() => pipeline.addPass(a)).toThrow(/already belongs/);
  });

  // 11
  test('adding a pass owned by another pipeline throws', () => {
    const a = new TestPass();
    const first = new RenderPipeline().addPass(a);
    const second = new RenderPipeline();

    expect(first.hasPass(a)).toBe(true);
    expect(() => second.addPass(a)).toThrow(/already belongs/);
  });

  // 12
  test('removePass releases ownership so the pass is re-addable elsewhere', () => {
    const a = new TestPass();
    const first = new RenderPipeline().addPass(a);
    const second = new RenderPipeline();

    first.removePass(a);

    expect(() => second.addPass(a)).not.toThrow();
    expect(second.hasPass(a)).toBe(true);
    expect(first.hasPass(a)).toBe(false);
  });

  // 13
  test('clear releases ownership of every pass', () => {
    const a = new TestPass();
    const first = new RenderPipeline().addPass(a);
    const second = new RenderPipeline();

    first.clear();

    expect(() => second.addPass(a)).not.toThrow();
  });

  // 14
  test('destroy cascades to child passes', () => {
    const a = new TestPass();
    const b = new TestPass();
    const pipeline = new RenderPipeline().addPass(a).addPass(b);

    pipeline.destroy();

    expect(a.destroyCount).toBe(1);
    expect(b.destroyCount).toBe(1);
  });

  // 15
  test('destroy releases ownership of child passes', () => {
    const a = new TestPass();
    const pipeline = new RenderPipeline().addPass(a);

    pipeline.destroy();

    expect(a._pipelineOwner).toBeNull();
  });

  // 16
  test('destroy is idempotent', () => {
    const a = new TestPass();
    const pipeline = new RenderPipeline().addPass(a);

    pipeline.destroy();
    pipeline.destroy();

    expect(a.destroyCount).toBe(1);
  });

  // 17
  test('mutators throw after destroy; queries are benign', () => {
    const a = new TestPass();
    const pipeline = new RenderPipeline().addPass(a);
    pipeline.destroy();

    expect(() => pipeline.addPass(new TestPass())).toThrow(/destroyed/);
    expect(() => pipeline.insertPass(new TestPass(), 0)).toThrow(/destroyed/);
    expect(() => pipeline.removePass(a)).toThrow(/destroyed/);
    expect(() => pipeline.clear()).toThrow(/destroyed/);

    expect(pipeline.size).toBe(0);
    expect(pipeline.hasPass(a)).toBe(false);
    expect(pipeline.indexOf(a)).toBe(-1);
    expect(pipeline.at(0)).toBeUndefined();
    expect([...pipeline]).toEqual([]);
  });

  // 18
  test('execute throws after destroy', () => {
    const pipeline = new RenderPipeline();
    pipeline.destroy();

    expect(() => pipeline.execute(ctx)).toThrow(/destroyed/);
  });

  // 19
  test('mutating during execute throws', () => {
    const pipeline = new RenderPipeline();
    const mutator = new TestPass({
      onExecute: () => {
        pipeline.addPass(new TestPass());
      },
    });
    pipeline.addPass(mutator);

    expect(() => pipeline.execute(ctx)).toThrow(/executing/);
  });

  // 19b
  test('destroying the pipeline during its own execute throws before any teardown begins', () => {
    const pipeline = new RenderPipeline();
    const victim = new TestPass();
    const destroyer = new TestPass({
      onExecute: () => {
        pipeline.destroy();
      },
    });
    pipeline.addPass(destroyer).addPass(victim);

    expect(() => pipeline.execute(ctx)).toThrow(/executing/);

    // Teardown never started: no child was destroyed and the pipeline is still live and intact.
    expect(destroyer.destroyCount).toBe(0);
    expect(victim.destroyCount).toBe(0);
    expect(pipeline.size).toBe(2);
    expect(pipeline.hasPass(victim)).toBe(true);
  });

  // 20
  test('re-entrant execute throws', () => {
    const pipeline = new RenderPipeline();
    const reentrant = new TestPass({
      onExecute: () => {
        pipeline.execute(ctx);
      },
    });
    pipeline.addPass(reentrant);

    expect(() => pipeline.execute(ctx)).toThrow(/re-entrant/);
  });

  // 21
  test('a self-cycle throws before mutating', () => {
    const pipeline = new RenderPipeline();

    expect(() => pipeline.addPass(pipeline)).toThrow(/cycle/);
    expect(pipeline.size).toBe(0);
  });

  // 22
  test('a two-pipeline cycle throws', () => {
    const a = new RenderPipeline();
    const b = new RenderPipeline();
    a.addPass(b);

    expect(() => b.addPass(a)).toThrow(/cycle/);
  });

  // 23
  test('an indirect three-pipeline cycle throws', () => {
    const a = new RenderPipeline();
    const b = new RenderPipeline();
    const c = new RenderPipeline();
    a.addPass(b);
    b.addPass(c);

    expect(() => c.addPass(a)).toThrow(/cycle/);
  });

  // 24
  test('nested pipelines execute their children', () => {
    const order: string[] = [];
    const world = new RenderPipeline({ label: 'world' })
      .addPass(new TestPass({ onExecute: () => order.push('terrain') }))
      .addPass(new TestPass({ onExecute: () => order.push('units') }));
    const ui = new RenderPipeline({ label: 'ui' }).addPass(new TestPass({ onExecute: () => order.push('hud') }));

    new RenderPipeline().addPass(world).addPass(ui).execute(ctx);

    expect(order).toEqual(['terrain', 'units', 'hud']);
  });

  // 25
  test('a thrown child aborts the remaining passes and propagates the error', () => {
    const before = new TestPass();
    const after = new TestPass();
    const boom = new TestPass({
      onExecute: () => {
        throw new Error('boom');
      },
    });
    const pipeline = new RenderPipeline().addPass(before).addPass(boom).addPass(after);

    expect(() => pipeline.execute(ctx)).toThrow('boom');
    expect(before.executions).toHaveLength(1);
    expect(after.executions).toHaveLength(0);
  });

  // 26
  test('a pipeline stays runnable after a child throws', () => {
    let shouldThrow = true;
    const flaky = new TestPass({
      onExecute: () => {
        if (shouldThrow) {
          throw new Error('boom');
        }
      },
    });
    const pipeline = new RenderPipeline().addPass(flaky);

    expect(() => pipeline.execute(ctx)).toThrow('boom');

    shouldThrow = false;

    expect(() => pipeline.execute(ctx)).not.toThrow();
    expect(flaky.executions).toHaveLength(2);
  });

  // 27
  test('resize cascades to disabled passes too', () => {
    const enabled = new TestPass();
    const disabled = new TestPass({ enabled: false });
    const pipeline = new RenderPipeline().addPass(enabled).addPass(disabled);

    pipeline.resize(800, 600);

    expect(enabled.resizes).toEqual([[800, 600]]);
    expect(disabled.resizes).toEqual([[800, 600]]);
  });

  // 28 — exception-safe best-effort teardown
  test('destroy keeps tearing down later children after an earlier child throws', () => {
    const a = new TestPass({
      onDestroy: () => {
        throw new Error('a boom');
      },
    });
    const b = new TestPass();
    const c = new TestPass();
    const pipeline = new RenderPipeline().addPass(a).addPass(b).addPass(c);

    expect(() => pipeline.destroy()).toThrow('a boom');
    expect(a.destroyCount).toBe(1);
    expect(b.destroyCount).toBe(1);
    expect(c.destroyCount).toBe(1);
  });

  // 29
  test('destroy releases every owner slot even when a middle child throws', () => {
    const a = new TestPass();
    const b = new TestPass({
      onDestroy: () => {
        throw new Error('b boom');
      },
    });
    const c = new TestPass();
    const pipeline = new RenderPipeline().addPass(a).addPass(b).addPass(c);

    expect(() => pipeline.destroy()).toThrow('b boom');
    expect(a._pipelineOwner).toBeNull();
    expect(b._pipelineOwner).toBeNull();
    expect(c._pipelineOwner).toBeNull();
  });

  // 30
  test('destroy rethrows the first error when multiple children throw, and cleanup stays complete', () => {
    const a = new TestPass({
      onDestroy: () => {
        throw new Error('first');
      },
    });
    const b = new TestPass({
      onDestroy: () => {
        throw new Error('second');
      },
    });
    const pipeline = new RenderPipeline().addPass(a).addPass(b);

    expect(() => pipeline.destroy()).toThrow('first');
    expect(a.destroyCount).toBe(1);
    expect(b.destroyCount).toBe(1);
    expect(pipeline.size).toBe(0);
  });

  // 31
  test('a pipeline is fully destroyed and empty after a child destroy throws', () => {
    const a = new TestPass({
      onDestroy: () => {
        throw new Error('boom');
      },
    });
    const pipeline = new RenderPipeline().addPass(a);

    expect(() => pipeline.destroy()).toThrow('boom');
    expect(pipeline.size).toBe(0);
    expect([...pipeline]).toEqual([]);
    expect(pipeline.hasPass(a)).toBe(false);
    expect(() => pipeline.addPass(new TestPass())).toThrow(/destroyed/);
    expect(() => pipeline.execute(ctx)).toThrow(/destroyed/);
  });

  // 32
  test('re-destroy is a no-op after a child destroy threw (children are not destroyed twice)', () => {
    const a = new TestPass({
      onDestroy: () => {
        throw new Error('boom');
      },
    });
    const pipeline = new RenderPipeline().addPass(a);

    expect(() => pipeline.destroy()).toThrow('boom');
    expect(a.destroyCount).toBe(1);

    expect(() => pipeline.destroy()).not.toThrow();
    expect(a.destroyCount).toBe(1);
  });

  // 33
  test('a child whose destroy threw is re-addable elsewhere (owner released)', () => {
    const a = new TestPass({
      onDestroy: () => {
        throw new Error('boom');
      },
    });
    const first = new RenderPipeline().addPass(a);

    expect(() => first.destroy()).toThrow('boom');

    const second = new RenderPipeline();
    expect(() => second.addPass(a)).not.toThrow();
    expect(second.hasPass(a)).toBe(true);
  });
});
