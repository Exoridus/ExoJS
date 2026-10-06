/**
 * The `ready` contract `AudioEffect` gives effects, for the package's
 * non-effect worklet components: pending until set up, resolved once ready,
 * rejected with the setup error, or with an `AbortError` when destroyed first.
 *
 * The promise is created only when someone asks for it, so a failure nobody
 * awaits raises no unhandled rejection.
 */
export class ReadyGate {
  private _state: 'pending' | 'ready' | 'failed' | 'aborted' = 'pending';
  private _failure: Error | null = null;
  private _promise: Promise<void> | null = null;
  private _resolve: (() => void) | null = null;
  private _reject: ((reason: Error) => void) | null = null;

  public constructor(private readonly _abortMessage: string) {}

  public get promise(): Promise<void> {
    if (this._promise === null) {
      switch (this._state) {
        case 'ready':
          this._promise = Promise.resolve();
          break;
        case 'failed':
          this._promise = Promise.reject(this._failure ?? new Error('Setup failed.'));
          break;
        case 'aborted':
          this._promise = Promise.reject(this._createAbortError());
          break;
        case 'pending':
          this._promise = new Promise<void>((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
          });
          break;
      }
    }

    return this._promise;
  }

  public resolve(): void {
    if (this._state !== 'pending') return;
    this._state = 'ready';
    this._resolve?.();
    this._clear();
  }

  public fail(error: unknown): void {
    if (this._state !== 'pending') return;
    this._state = 'failed';
    this._failure = error instanceof Error ? error : new Error(String(error));
    this._reject?.(this._failure);
    this._clear();
  }

  /** Rejects a gate that is still pending; a settled gate keeps its outcome. */
  public abort(): void {
    if (this._state !== 'pending') return;
    this._state = 'aborted';
    this._reject?.(this._createAbortError());
    this._clear();
  }

  private _createAbortError(): DOMException {
    return new DOMException(this._abortMessage, 'AbortError');
  }

  private _clear(): void {
    this._resolve = null;
    this._reject = null;
  }
}
