// Shared base for the effect and analysis processors. Bundled into each
// worklet that imports it by the `?worklet` plugin; typechecked against the
// AudioWorkletGlobalScope like the worklets themselves.

/**
 * Stops rendering for good once the owning node posts `{ type: 'destroy' }`.
 *
 * Disconnecting an `AudioWorkletNode` does not end its processor: while
 * `process()` keeps returning `true` the processor stays active and is called
 * every render quantum until the AudioContext itself closes. Returning `false`
 * after the owner's destroy is what lets the browser release it.
 */
export abstract class DisposableProcessor extends AudioWorkletProcessor {
  protected _destroyed = false;

  public constructor(options?: unknown) {
    super(options);
    this.port.onmessage = event => {
      if ((event.data as { type?: unknown } | null)?.type === 'destroy') {
        this._destroyed = true;
        this.port.onmessage = null;
      }
    };
  }
}
