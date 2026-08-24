import { Connectivity } from '#core/Connectivity';
import type { NetworkHint, NetworkHintSource, PlatformSubscription } from '#platform/PlatformAdapter';

/** A hint source a test drives directly, standing in for a platform adapter. */
function hintSource(initial: NetworkHint = 'online') {
  const listeners = new Set<(hint: NetworkHint) => void>();
  let current = initial;

  const source: NetworkHintSource = {
    get networkHint(): NetworkHint {
      return current;
    },
    onNetworkHintChange(listener: (hint: NetworkHint) => void): PlatformSubscription {
      listeners.add(listener);

      return () => void listeners.delete(listener);
    },
  };

  return {
    source,
    get listenerCount(): number {
      return listeners.size;
    },
    emit(hint: NetworkHint): void {
      current = hint;

      for (const listener of [...listeners]) {
        listener(hint);
      }
    },
  };
}

describe('Connectivity state', () => {
  test('starts at whatever the host already reports', () => {
    expect(new Connectivity(hintSource('offline').source).state).toBe('offline');
    expect(new Connectivity(hintSource('unknown').source).state).toBe('unknown');
  });

  test('follows the host, and announces each change once', () => {
    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);
    const seen: string[] = [];

    connectivity.onStateChange.add(state => void seen.push(state));

    host.emit('offline');
    host.emit('offline');
    host.emit('online');

    expect(connectivity.state).toBe('online');
    expect(seen).toEqual(['offline', 'online']);
  });
});

describe('Connectivity mode', () => {
  test('defaults to following the host', () => {
    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);

    expect(connectivity.mode).toBe('auto');
    expect(connectivity.allowsNetwork).toBe(true);

    host.emit('offline');

    expect(connectivity.allowsNetwork).toBe(false);
  });

  test('an unknown host state permits the network, because nothing said otherwise', () => {
    const connectivity = new Connectivity(hintSource('unknown').source);

    // Refusing on no evidence would break every environment that reports
    // nothing about reachability.
    expect(connectivity.state).toBe('unknown');
    expect(connectivity.allowsNetwork).toBe(true);
  });

  test('an explicit offline mode overrides a host that says otherwise', () => {
    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);

    connectivity.mode = 'offline';

    expect(connectivity.state).toBe('online');
    expect(connectivity.allowsNetwork).toBe(false);
  });

  test('an explicit online mode overrides a host that says otherwise', () => {
    const host = hintSource('offline');
    const connectivity = new Connectivity(host.source);

    connectivity.mode = 'online';

    expect(connectivity.state).toBe('offline');
    expect(connectivity.allowsNetwork).toBe(true);
  });

  test('announces each mode change once', () => {
    const connectivity = new Connectivity(hintSource().source);
    const seen: string[] = [];

    connectivity.onModeChange.add(mode => void seen.push(mode));

    connectivity.mode = 'offline';
    connectivity.mode = 'offline';
    connectivity.mode = 'auto';

    expect(seen).toEqual(['offline', 'auto']);
  });

  test('the state keeps tracking the host while a mode overrides what it permits', () => {
    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);

    connectivity.mode = 'online';
    host.emit('offline');

    // A UI reading `state` still shows the truth about the environment; only
    // what the application ALLOWS is overridden.
    expect(connectivity.state).toBe('offline');
    expect(connectivity.allowsNetwork).toBe(true);
  });
});

describe('Connectivity teardown', () => {
  test('stops listening to a source it was handed, and leaves the source alone', () => {
    const host = hintSource();
    const connectivity = new Connectivity(host.source);

    expect(host.listenerCount).toBe(1);

    connectivity.destroy();

    expect(host.listenerCount).toBe(0);
  });

  test('clears its signals', () => {
    const connectivity = new Connectivity(hintSource().source);

    connectivity.onStateChange.add(() => undefined);
    connectivity.onModeChange.add(() => undefined);

    connectivity.destroy();

    expect(connectivity.onStateChange.count).toBe(0);
    expect(connectivity.onModeChange.count).toBe(0);
  });

  test('a Connectivity built with no source reads the browser and tears its own listeners down', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const connectivity = new Connectivity();

    expect(addSpy.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['online', 'offline']));

    connectivity.destroy();

    expect(removeSpy.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['online', 'offline']));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
