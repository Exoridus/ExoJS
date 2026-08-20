import type { MediaCrossOrigin, StreamingLoadEvent } from '#core/types';

const onceListenerOption = { once: true };

/** Options shared by the streaming media factories. */
export interface MediaLoadOptions {
  /**
   * Fetch the complete resource through the loader's byte/cache pipeline before
   * the media element is built, instead of letting the browser stream it from
   * its URL.
   *
   * Downloading makes the bytes cacheable and available offline, reports real
   * fetch progress, and is what container (`.exoa`) entries always use. It also
   * means nothing plays until the whole file has arrived.
   */
  download?: boolean;
  /**
   * Defaults to `'anonymous'`. Ignored for downloaded or container-backed media,
   * whose bytes are already owned by the application.
   */
  crossOrigin?: MediaCrossOrigin;
  /**
   * The media event that marks the asset ready. Defaults to `'canplay'`:
   * playback can start, which for streamed media deliberately does not mean the
   * resource has fully arrived. `'loadedmetadata'` resolves earlier (duration
   * and dimensions only, nothing playable yet), `'canplaythrough'` waits for the
   * browser to predict uninterrupted playback.
   */
  loadEvent?: StreamingLoadEvent;
  /**
   * Milliseconds to wait after a `stalled` event before failing the load. When
   * omitted a stalled load waits indefinitely. Each further `stalled` event
   * restarts the timer.
   */
  stallTimeout?: number;
}

/** Diagnostic messages a media factory reports for each failure mode. */
export interface MediaLoadMessages {
  readonly error: string;
  readonly abort: string;
  readonly emptied: string;
  readonly stalled: string;
}

export interface AttachMediaSourceOptions {
  readonly element: HTMLMediaElement;
  readonly src: string;
  readonly messages: MediaLoadMessages;
  readonly loadEvent?: StreamingLoadEvent | undefined;
  readonly stallTimeout?: number | undefined;
  /** `undefined` leaves the attribute untouched, for a same-origin blob source. */
  readonly crossOrigin?: MediaCrossOrigin | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Runs exactly once, whatever the outcome, before the promise settles. */
  readonly onSettled?: (() => void) | undefined;
}

/**
 * Stops whatever the element is still doing and drops its source, so the
 * browser can release the media resource and end any transfer it is running.
 *
 * Detaching is best-effort by nature: the specification lets a user agent keep a
 * connection open for its own caching, so this ends the element's interest
 * rather than guaranteeing the network is idle.
 */
export function detachMediaElement(element: HTMLMediaElement): void {
  element.pause();
  element.removeAttribute('src');
  element.load();
}

/**
 * Points `element` at `src` and resolves once it reaches its load event.
 *
 * Rejects on `error`, `abort` or `emptied`, on a stall that outlives
 * `stallTimeout`, and on `signal` aborting - the last with an `AbortError`, so a
 * deliberate cancel stays distinguishable from a failed load. Any rejection
 * detaches the element first.
 */
export function attachMediaSource(options: AttachMediaSourceOptions): Promise<void> {
  const { element, src, messages, loadEvent, stallTimeout, crossOrigin, signal, onSettled } = options;

  return new Promise<void>((resolve, reject) => {
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;

      if (stallTimer !== undefined) {
        clearTimeout(stallTimer);
        stallTimer = undefined;
      }

      signal?.removeEventListener('abort', onAbort);
      onSettled?.();
      fn();
    };

    const fail = (message: string): void =>
      settle(() => {
        detachMediaElement(element);
        reject(new Error(message));
      });

    function onAbort(): void {
      settle(() => {
        detachMediaElement(element);
        reject(new DOMException('Media load was cancelled.', 'AbortError'));
      });
    }

    if (signal?.aborted === true) {
      onAbort();

      return;
    }

    signal?.addEventListener('abort', onAbort, onceListenerOption);

    element.addEventListener('error', () => fail(messages.error), onceListenerOption);
    element.addEventListener('abort', () => fail(messages.abort), onceListenerOption);
    element.addEventListener('emptied', () => fail(messages.emptied), onceListenerOption);
    element.addEventListener(loadEvent ?? 'canplay', () => settle(resolve), onceListenerOption);

    // 'stalled' fires transiently during normal buffering on a slow connection,
    // so it only fails a load once it persists past an explicit timeout.
    if (stallTimeout !== undefined) {
      element.addEventListener('stalled', () => {
        if (settled) return;
        if (stallTimer !== undefined) clearTimeout(stallTimer);

        stallTimer = setTimeout(() => fail(messages.stalled), stallTimeout);
      });
    }

    if (crossOrigin !== undefined) {
      // Must precede `src`: the attribute takes part in the resource fetch the
      // assignment starts, and setting it afterwards would not apply to it.
      if (crossOrigin === null) {
        element.removeAttribute('crossorigin');
      } else {
        element.crossOrigin = crossOrigin;
      }
    }

    element.preload = 'auto';
    element.src = src;
  });
}
