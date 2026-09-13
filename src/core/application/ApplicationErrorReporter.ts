import { showDevErrorOverlay } from '#core/devErrorOverlay';
import { logger } from '#core/Logger';
import type { Signal } from '#core/Signal';
import { RenderError, type RenderErrorCode } from '#rendering/RenderError';

/**
 * One entry of the bounded {@link Application.recentErrors} ring buffer -
 * a JSON-friendly snapshot of an engine error (feeds future debug dumps).
 */
export interface RecentErrorEntry {
  /** `Date.now()` at the moment the error was recorded. */
  readonly time: number;
  readonly message: string;
  /** Machine-readable failure class - present for {@link RenderError}s. */
  readonly code?: RenderErrorCode;
  readonly stack?: string;
}

/** Consecutive failing frames tolerated before the frame guard halts the loop. */
export const maxConsecutiveFrameErrors = 3;
/** Bounded size of the {@link Application.recentErrors} ring buffer. */
const maxRecentErrors = 20;

/**
 * The engine's error pipeline: log, bounded history, `onError` dispatch, dev
 * banner - plus the consecutive-failure count the frame guard halts on.
 *
 * It reports what happened and how bad it is; what a fatal frame error *means*
 * - halting the loop, moving the application to `Stopped` - stays with the
 * application that owns the loop.
 */
export class ApplicationErrorReporter {
  private _consecutiveFrameErrors = 0;
  private readonly _recent: RecentErrorEntry[] = [];

  /**
   * `element` is the surface a development build draws the error banner over.
   * `null` for an application rendering into an `OffscreenCanvas`, which has
   * no element to draw on; the rest of the pipeline is unaffected.
   */
  public constructor(
    private readonly _onError: Signal<[error: Error]>,
    private readonly _element: HTMLCanvasElement | null,
  ) {}

  /** Recent engine errors, newest last, bounded to the ring size. */
  public get recent(): readonly RecentErrorEntry[] {
    return this._recent;
  }

  /**
   * Record a failure from the per-frame body and report whether the frame
   * guard's tolerance is now exhausted. A non-`Error` throw is normalized
   * before it enters the history.
   */
  public recordFrameError(error: unknown): boolean {
    const normalized = error instanceof Error ? error : new Error(String(error));

    this._consecutiveFrameErrors++;

    const fatal = this._consecutiveFrameErrors >= maxConsecutiveFrameErrors;

    this.report(normalized, fatal);

    return fatal;
  }

  /**
   * Record an asynchronous backend render error. Same history, dispatch and
   * banner as a frame error, but no consecutive-failure counting - async
   * validation errors do not break the frame loop - and no console log, since
   * the backend already logged it at its first occurrence and dedupes repeats.
   */
  public recordRenderError(error: RenderError): void {
    this.report(error, false, true);
  }

  /** Clear the consecutive-failure count after a frame that completed. */
  public resetFrameErrors(): void {
    this._consecutiveFrameErrors = 0;
  }

  /**
   * Run one error through every stage: console log unless `alreadyLogged`,
   * bounded history, `onError` dispatch, and the development banner. `fatal`
   * only changes how the banner presents the error.
   */
  public report(error: Error, fatal: boolean, alreadyLogged = false): void {
    const isRenderError = error instanceof RenderError;

    if (!alreadyLogged) {
      logger.error(error.message, { source: isRenderError ? 'rendering' : 'core', error });
    }

    this._recent.push({
      time: Date.now(),
      message: error.message,
      ...(isRenderError && { code: error.code }),
      ...(error.stack !== undefined && { stack: error.stack }),
    });

    if (this._recent.length > maxRecentErrors) {
      this._recent.shift();
    }

    this._onError.dispatch(error);

    if (__DEV__) {
      const detail = isRenderError && error.detail !== null ? `\n${error.detail}` : '';

      if (this._element !== null) {
        showDevErrorOverlay(this._element, `${error.message}${detail}`, { fatal });
      }
    }
  }
}
