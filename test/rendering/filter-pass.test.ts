import type { BackendRenderPass } from '#rendering/BackendRenderPass';
import { FilterPass } from '#rendering/FilterPass';
import { Filter } from '#rendering/filters/Filter';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';

/** One `apply` call, recorded by identity so a test can assert what a stage read and wrote. */
interface Application {
  readonly filter: RecordingFilter;
  readonly input: RenderTexture;
  readonly output: RenderTexture;
  readonly resolution: number | undefined;
}

class RecordingFilter extends Filter {
  public constructor(
    public readonly name: string,
    private readonly _onApply?: () => void,
  ) {
    super();
  }

  public override apply(_backend: RenderBackend, _input: RenderTexture, _output: RenderTexture, _resolution?: number): void {
    this._onApply?.();
  }
}

class BackendStub {
  public readonly applications: Application[] = [];
  public readonly acquired: RenderTexture[] = [];
  public readonly released: RenderTexture[] = [];
  public readonly draws: RenderTexture[] = [];
  public renderTarget: { width: number; height: number } = { width: 64, height: 32 };
  public view: unknown = null;
  private _nextId = 0;

  /** The target-redirect path this stub takes: no pass coordinator, so `BackendTargetPass` saves and restores by hand. */
  public setRenderTarget(target: { width: number; height: number }): void {
    this.renderTarget = target;
  }

  public setView(view: unknown): void {
    this.view = view;
  }

  public clear(): void {
    // The redirect clears the destination before the blit; nothing here depends on it.
  }

  public acquireRenderTexture(width: number, height: number): RenderTexture {
    const texture = new RenderTexture(width, height);

    (texture as RenderTexture & { poolId: number }).poolId = this._nextId++;
    this.acquired.push(texture);

    return texture;
  }

  public releaseRenderTexture(texture: RenderTexture): this {
    this.released.push(texture);

    return this;
  }

  public execute(pass: BackendRenderPass): this {
    pass.execute(this as unknown as RenderBackend);

    return this;
  }

  public draw(drawable: { texture: RenderTexture }): void {
    this.draws.push(drawable.texture);
  }

  /** Wire a filter so its `apply` is recorded against this backend. */
  public track(filter: RecordingFilter): RecordingFilter {
    const original = filter.apply.bind(filter);

    filter.apply = (backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution?: number): void => {
      this.applications.push({ filter, input, output, resolution });
      original(backend, input, output, resolution);
    };

    return filter;
  }
}

const contextFor = (backend: BackendStub): RenderingContext => ({ backend }) as unknown as RenderingContext;

describe('FilterPass', () => {
  test('a single filter writes the caller target directly, borrowing nothing', () => {
    const backend = new BackendStub();
    const source = new RenderTexture(64, 32);
    const target = new RenderTexture(64, 32);
    const filter = backend.track(new RecordingFilter('one'));

    new FilterPass(source, filter, { target }).execute(contextFor(backend));

    expect(backend.applications).toHaveLength(1);
    expect(backend.applications[0]!.input).toBe(source);
    expect(backend.applications[0]!.output).toBe(target);
    expect(backend.acquired).toHaveLength(0);
    expect(backend.draws).toHaveLength(0);
  });

  test('a chain alternates between two borrowed intermediates and returns both', () => {
    const backend = new BackendStub();
    const source = new RenderTexture(64, 32);
    const target = new RenderTexture(64, 32);
    const first = backend.track(new RecordingFilter('first'));
    const second = backend.track(new RecordingFilter('second'));
    const third = backend.track(new RecordingFilter('third'));

    new FilterPass(source, [first, second, third], { target }).execute(contextFor(backend));

    const [a, b, c] = backend.applications;

    expect(a!.input).toBe(source);
    expect(b!.input).toBe(a!.output);
    expect(c!.input).toBe(b!.output);
    expect(c!.output).toBe(target);
    // Two intermediates cover a chain of any length: a stage never writes the
    // texture it is reading, and everything older than the previous stage is
    // free again.
    expect(backend.acquired).toHaveLength(2);
    expect(backend.released).toEqual(backend.acquired);
  });

  test('intermediates are returned when a filter throws', () => {
    const backend = new BackendStub();
    const source = new RenderTexture(64, 32);
    const target = new RenderTexture(64, 32);
    const first = backend.track(new RecordingFilter('first'));
    const failing = backend.track(
      new RecordingFilter('failing', () => {
        throw new Error('filter failed');
      }),
    );

    expect(() => new FilterPass(source, [first, failing], { target }).execute(contextFor(backend))).toThrow('filter failed');
    expect(backend.acquired).toHaveLength(1);
    expect(backend.released).toEqual(backend.acquired);
  });

  test('a destination equal to the source runs through an intermediate and blits back', () => {
    const backend = new BackendStub();
    const shared = new RenderTexture(64, 32);
    const filter = backend.track(new RecordingFilter('one'));

    new FilterPass(shared, filter, { target: shared }).execute(contextFor(backend));

    expect(backend.applications[0]!.input).toBe(shared);
    expect(backend.applications[0]!.output).not.toBe(shared);
    expect(backend.acquired).toHaveLength(1);
    expect(backend.draws).toEqual([backend.acquired[0]]);
    expect(backend.released).toEqual(backend.acquired);
  });

  test('without a target the result is blitted into the active target', () => {
    const backend = new BackendStub();
    const source = new RenderTexture(64, 32);
    const filter = backend.track(new RecordingFilter('one'));

    new FilterPass(source, filter).execute(contextFor(backend));

    expect(backend.acquired).toHaveLength(1);
    expect(backend.draws).toEqual([backend.acquired[0]]);
    expect(backend.released).toEqual(backend.acquired);
  });

  test('an empty chain is a blit of the source', () => {
    const backend = new BackendStub();
    const source = new RenderTexture(64, 32);

    new FilterPass(source).execute(contextFor(backend));

    expect(backend.acquired).toHaveLength(0);
    expect(backend.draws).toEqual([source]);
  });

  test('intermediates take the destination size, and the resolution reaches every stage', () => {
    const backend = new BackendStub();
    const source = new RenderTexture(16, 16);
    const target = new RenderTexture(128, 64);
    const first = backend.track(new RecordingFilter('first'));
    const second = backend.track(new RecordingFilter('second'));

    new FilterPass(source, [first, second], { target, resolution: 2 }).execute(contextFor(backend));

    expect(backend.acquired[0]!.width).toBe(128);
    expect(backend.acquired[0]!.height).toBe(64);
    expect(backend.applications.map(application => application.resolution)).toEqual([2, 2]);
  });

  test('a degenerate active target runs nothing', () => {
    const backend = new BackendStub();

    backend.renderTarget.width = 0;

    const filter = backend.track(new RecordingFilter('one'));

    new FilterPass(new RenderTexture(64, 32), filter).execute(contextFor(backend));

    expect(backend.applications).toHaveLength(0);
    expect(backend.acquired).toHaveLength(0);
    expect(backend.draws).toHaveLength(0);
  });
});
