import type { NetworkHint, NetworkHintSource, PlatformSubscription } from './PlatformAdapter';

/**
 * What the browser currently reports, or `'unknown'` where it reports nothing.
 *
 * A host without `navigator.onLine` is not offline - it is silent, and saying
 * `'online'` for it would claim knowledge nobody has.
 * @internal
 */
export function readBrowserNetworkHint(): NetworkHint {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return 'unknown';
  }

  return navigator.onLine ? 'online' : 'offline';
}

/** A hint source that also owns the listeners it installed. @internal */
export interface OwnedNetworkHintSource extends NetworkHintSource {
  /** Removes the window listeners this source installed. */
  destroy(): void;
}

/**
 * The browser's own network-reachability hint: `navigator.onLine`, kept current
 * by the `online` and `offline` window events.
 *
 * What the browser reports is whether it has a usable network interface. A
 * captive portal, a dead resolver and a firewalled origin all report as online,
 * so this can say "probably reachable" and "definitely not", never "reachable".
 *
 * Shared by {@link BrowserPlatform} and by a standalone {@link Connectivity},
 * so the two window listeners and the `navigator` read exist once.
 */
export function browserNetworkHints(): OwnedNetworkHintSource {
  const listeners = new Set<(hint: NetworkHint) => void>();
  let current = readBrowserNetworkHint();

  const update = (): void => {
    const hint = readBrowserNetworkHint();

    if (hint === current) {
      return;
    }

    current = hint;

    for (const listener of [...listeners]) {
      listener(hint);
    }
  };

  const listening = typeof window !== 'undefined';

  if (listening) {
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  }

  return {
    get networkHint(): NetworkHint {
      return current;
    },

    onNetworkHintChange(listener: (hint: NetworkHint) => void): PlatformSubscription {
      listeners.add(listener);

      let done = false;

      return (): void => {
        if (done) {
          return;
        }

        done = true;
        listeners.delete(listener);
      };
    },

    destroy(): void {
      if (listening) {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      }

      listeners.clear();
    },
  };
}
