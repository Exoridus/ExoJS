describe('@/core/Application import behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // Explicit timeout above the project default (15s): under istanbul coverage
  // instrumentation this dynamic `import()` compiles the full Application
  // module graph on demand (nothing is pre-transformed/cached at file-load
  // time, unlike a static top-level import), which measured consistently at
  // 14-18s under `pnpm test:coverage` — right at the default budget's edge.
  // Functionally instant without coverage (~3s); this only widens the margin
  // for the one-time instrumentation cost.
  it('does not create a canvas on import', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    await import('#core/Application');

    expect(createElementSpy).not.toHaveBeenCalled();
  }, 25_000);
});
