/**
 * `ApplicationSizing` on its own: the three geometry axes and the commit
 * predicate, without a backend to push them into.
 */
import { ApplicationSizing, type ApplicationSizingHooks } from '#core/application/ApplicationSizing';
import { CanvasSizing, type CanvasSizingContext, type CanvasSizingMetrics } from '#core/sizing/CanvasSizing';

class RecordingSizing extends CanvasSizing {
  public context: CanvasSizingContext | null = null;
  public detachCount = 0;

  public override attach(context: CanvasSizingContext): void {
    this.context = context;
  }

  public override detach(): void {
    this.detachCount++;
  }

  /** Commit `metrics` the way a live policy would - through the context it was attached with. */
  public commit(metrics: CanvasSizingMetrics): void {
    this.context?.apply(metrics);
  }
}

const fullMetrics = (size: number): CanvasSizingMetrics => ({
  cssWidth: size,
  cssHeight: size,
  logicalWidth: size,
  logicalHeight: size,
  renderWidth: size,
  renderHeight: size,
});

interface Fixture {
  readonly sizing: ApplicationSizing;
  readonly element: HTMLCanvasElement;
  readonly commits: Array<[number, number]>;
  readonly ratioChanges: { count: number };
}

const createSizing = (options: { pixelRatio?: number; hasPolicy?: boolean } = {}): Fixture => {
  const element = document.createElement('canvas');
  const commits: Array<[number, number]> = [];
  const ratioChanges = { count: 0 };
  const hooks: ApplicationSizingHooks = {
    onCommit: (width, height) => {
      commits.push([width, height]);
    },
    onPixelRatioChange: () => {
      ratioChanges.count++;
    },
  };

  const sizing = new ApplicationSizing(element, element, {
    baseWidth: 800,
    baseHeight: 600,
    pixelRatio: options.pixelRatio ?? 1,
    hasPolicy: options.hasPolicy ?? false,
    hooks,
  });

  return { sizing, element, commits, ratioChanges };
};

describe('ApplicationSizing', () => {
  test('construction sizes the surface without reporting a commit', () => {
    const { sizing, element, commits } = createSizing();

    expect(element.width).toBe(800);
    expect(element.height).toBe(600);
    expect(sizing.width).toBe(800);
    expect(sizing.height).toBe(600);
    // Nothing is listening yet - the render target the sink resizes does not exist
    // at construction time.
    expect(commits).toEqual([]);
  });

  test('with no policy the canvas owns its CSS box; with one it does not', () => {
    expect(createSizing({ hasPolicy: false }).element.style.width).toBe('800px');
    expect(createSizing({ hasPolicy: true }).element.style.width).toBe('');
  });

  test('the backing store is the render resolution times the pixel ratio', () => {
    const { element } = createSizing({ pixelRatio: 2 });

    expect(element.width).toBe(1600);
    expect(element.height).toBe(1200);
  });

  test('a policy commit moves all three axes and is reported once', () => {
    const { sizing, element, commits } = createSizing({ hasPolicy: true });
    const policy = new RecordingSizing();

    sizing.policy = policy;
    commits.length = 0;

    policy.commit({ cssWidth: 400, cssHeight: 300, logicalWidth: 200, logicalHeight: 150, renderWidth: 400, renderHeight: 300 });

    expect(sizing.width).toBe(200);
    expect(sizing.height).toBe(150);
    expect(element.width).toBe(400);
    expect(element.style.width).toBe('400px');
    expect(commits).toEqual([[200, 150]]);
  });

  test('a commit that changes nothing is not reported again', () => {
    const { sizing, commits } = createSizing({ hasPolicy: true });
    const policy = new RecordingSizing();

    sizing.policy = policy;
    policy.commit(fullMetrics(500));
    commits.length = 0;

    policy.commit(fullMetrics(500));

    expect(commits).toEqual([]);
  });

  test('a collapsed host is ignored outright rather than committed as a zero geometry', () => {
    const { sizing, commits } = createSizing({ hasPolicy: true });
    const policy = new RecordingSizing();

    sizing.policy = policy;
    policy.commit(fullMetrics(500));
    commits.length = 0;

    policy.commit({ cssWidth: 0, cssHeight: 0, logicalWidth: 0, logicalHeight: 0, renderWidth: 0, renderHeight: 0 });

    expect(sizing.width).toBe(500);
    expect(commits).toEqual([]);
  });

  test('a collapsed display box alone is enough to refuse the whole commit', () => {
    const { sizing, commits } = createSizing({ hasPolicy: true });
    const policy = new RecordingSizing();

    sizing.policy = policy;
    policy.commit(fullMetrics(500));
    commits.length = 0;

    policy.commit({ cssWidth: 0, cssHeight: 0, logicalWidth: 500, logicalHeight: 500, renderWidth: 500, renderHeight: 500 });

    expect(commits).toEqual([]);
  });

  test('swapping policies detaches the outgoing one and clears the box it wrote', () => {
    const { sizing, element } = createSizing({ hasPolicy: true });
    const first = new RecordingSizing();
    const second = new RecordingSizing();

    sizing.policy = first;
    first.commit(fullMetrics(500));

    expect(element.style.width).toBe('500px');

    sizing.policy = second;

    expect(first.detachCount).toBe(1);
    expect(element.style.width).toBe('');
    expect(sizing.policy).toBe(second);
  });

  test('attaching the first policy over the base commit reports nothing when nothing moved', () => {
    const { sizing, element, commits } = createSizing({ hasPolicy: false });

    sizing.attachPolicy(null);

    expect(commits).toEqual([]);
    expect(element.style.width).toBe('800px');
  });

  test('attaching a real first policy reports only what that policy commits', () => {
    const { sizing, commits } = createSizing({ hasPolicy: true });
    const policy = new RecordingSizing();

    sizing.attachPolicy(policy);

    expect(commits).toEqual([]);

    policy.commit(fullMetrics(500));

    expect(commits).toEqual([[500, 500]]);
  });

  test('re-assigning the active policy detaches and re-attaches it, so it re-reads its host', () => {
    const { sizing } = createSizing({ hasPolicy: true });
    const policy = new RecordingSizing();

    sizing.policy = policy;
    sizing.policy = policy;

    expect(policy.detachCount).toBe(1);
  });

  test('rebase moves the base resolution and re-derives from it', () => {
    const { sizing, element, commits } = createSizing();

    commits.length = 0;
    sizing.rebase(1024, 768);

    expect(sizing.baseWidth).toBe(1024);
    expect(sizing.width).toBe(1024);
    expect(element.width).toBe(1024);
    expect(commits).toEqual([[1024, 768]]);
  });

  test('backing-store coordinates scale into the logical view', () => {
    const { sizing } = createSizing({ pixelRatio: 2 });

    expect(sizing.toLogical(1600, 1200)).toEqual({ x: 800, y: 600 });
    expect(sizing.toLogical(800, 600)).toEqual({ x: 400, y: 300 });
  });

  test('teardown gives up the observation and keeps the geometry on screen', () => {
    const { sizing, element } = createSizing({ hasPolicy: true });
    const policy = new RecordingSizing();

    sizing.policy = policy;
    policy.commit(fullMetrics(500));

    sizing.detachPolicy();

    expect(policy.detachCount).toBe(1);
    expect(sizing.policy).toBeNull();
    expect(element.style.width).toBe('500px');
    expect(element.width).toBe(500);
  });
});
