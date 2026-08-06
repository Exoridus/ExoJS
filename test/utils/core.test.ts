describe('utils/core', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does not touch the DOM while importing the module', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    await import('#core/utils');

    expect(createElementSpy).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it('creates the audio element lazily when codec support is checked', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    const { supportsCodec } = await import('#core/utils');

    supportsCodec('@/audio/mpeg');

    expect(createElementSpy).toHaveBeenCalledWith('audio');
  });

  it('probes passive event support lazily', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    const { supportsEventOptions } = await import('#core/utils');

    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(supportsEventOptions()).toBe(true);
    expect(addEventListenerSpy).toHaveBeenCalled();
  });

  // Gates the `auto` backend choice away from WebKit's WebGPU, so a
  // misclassification either strands Safari on WebGL2 or hands Chrome a broken
  // picture. Real UA strings, since that is what the regexes actually meet.
  describe('isWebKitUserAgent', () => {
    const webkit = [
      ['Safari 18, macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15'],
      [
        'Safari, iPhone',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
      ],
      ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1'],
      // Brand-name browsers on iOS are WebKit underneath and inherit the same
      // rendering defects, so they belong on this side of the test.
      [
        'Chrome, iOS',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/133.0.0.0 Mobile/15E148 Safari/604.1',
      ],
      [
        'Firefox, iOS',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15',
      ],
    ] as const;

    const notWebKit = [
      ['Chrome, macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'],
      ['Edge, Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'],
      ['Firefox, desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0'],
      // Carries AppleWebKit with no Safari token. The unit suite runs under it,
      // so misreading this as WebKit would silently steer every `auto` backend
      // test to WebGL2.
      ['jsdom', 'Mozilla/5.0 (win32) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/29.1.1'],
    ] as const;

    it.each(webkit)('detects %s', async (_label, userAgent) => {
      const { isWebKitUserAgent } = await import('#core/utils');

      expect(isWebKitUserAgent(userAgent)).toBe(true);
    });

    it.each(notWebKit)('does not flag %s', async (_label, userAgent) => {
      const { isWebKitUserAgent } = await import('#core/utils');

      expect(isWebKitUserAgent(userAgent)).toBe(false);
    });
  });
});
