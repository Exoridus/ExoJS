/**
 * `ApplicationErrorReporter` on its own: the history, the dispatch and the
 * consecutive-failure count that the frame guard halts on.
 */
import { ApplicationErrorReporter, maxConsecutiveFrameErrors } from '#core/application/ApplicationErrors';
import { Signal } from '#core/Signal';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';

const createReporter = (): { reporter: ApplicationErrorReporter; onError: Signal<[error: Error]>; dispatched: Error[] } => {
  const onError = new Signal<[error: Error]>();
  const dispatched: Error[] = [];

  onError.add(error => {
    dispatched.push(error);
  });

  return { reporter: new ApplicationErrorReporter(onError, null), onError, dispatched };
};

describe('ApplicationErrorReporter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a frame error is recorded, dispatched, and non-fatal on its own', () => {
    const { reporter, dispatched } = createReporter();
    const error = new Error('frame failed');

    expect(reporter.recordFrameError(error)).toBe(false);
    expect(dispatched).toEqual([error]);
    expect(reporter.recent).toHaveLength(1);
    expect(reporter.recent[0]?.message).toBe('frame failed');
  });

  test('a non-Error throw is normalized before it enters the history', () => {
    const { reporter, dispatched } = createReporter();

    reporter.recordFrameError('a string was thrown');

    expect(dispatched[0]).toBeInstanceOf(Error);
    expect(reporter.recent[0]?.message).toBe('a string was thrown');
  });

  test('the guard turns fatal on the configured consecutive failure, and not before', () => {
    const { reporter } = createReporter();
    const outcomes: boolean[] = [];

    for (let attempt = 0; attempt < maxConsecutiveFrameErrors; attempt++) {
      outcomes.push(reporter.recordFrameError(new Error('persistent')));
    }

    expect(outcomes).toEqual([...Array.from({ length: maxConsecutiveFrameErrors - 1 }, () => false), true]);
  });

  test('a frame that completes clears the count, so intermittent failures never accumulate', () => {
    const { reporter } = createReporter();

    for (let attempt = 0; attempt < maxConsecutiveFrameErrors * 3; attempt++) {
      expect(reporter.recordFrameError(new Error('intermittent'))).toBe(false);
      reporter.resetFrameErrors();
    }
  });

  test('async render errors never count towards the frame guard', () => {
    const { reporter } = createReporter();

    for (let attempt = 0; attempt < maxConsecutiveFrameErrors * 2; attempt++) {
      reporter.recordRenderError(new RenderError({ code: 'validation', backendType: RenderBackendType.WebGpu, message: 'validation failed' }));
    }

    expect(reporter.recordFrameError(new Error('first frame failure'))).toBe(false);
  });

  test('a render error carries its machine-readable code into the history', () => {
    const { reporter } = createReporter();

    reporter.recordRenderError(new RenderError({ code: 'validation', backendType: RenderBackendType.WebGpu, message: 'validation failed' }));

    expect(reporter.recent[0]?.code).toBe('validation');
  });

  test('an error the backend already logged is not logged a second time', () => {
    const { reporter } = createReporter();
    const consoleError = vi.mocked(console.error);

    reporter.recordRenderError(new RenderError({ code: 'validation', backendType: RenderBackendType.WebGpu, message: 'validation failed' }));

    expect(consoleError).not.toHaveBeenCalled();

    reporter.recordFrameError(new Error('frame failed'));

    expect(consoleError).toHaveBeenCalled();
  });

  test('the history is bounded and keeps the newest entries', () => {
    const { reporter } = createReporter();

    for (let index = 0; index < 25; index++) {
      reporter.recordFrameError(new Error(`error ${index}`));
      reporter.resetFrameErrors();
    }

    expect(reporter.recent).toHaveLength(20);
    expect(reporter.recent[0]?.message).toBe('error 5');
    expect(reporter.recent.at(-1)?.message).toBe('error 24');
  });
});
