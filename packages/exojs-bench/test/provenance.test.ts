import { classifyPrerelease, DEFAULT_RENDERING_BROWSER, parseRenderingBrowser } from '../src/shared/provenance';

/**
 * The two provenance decisions a run cannot take back: which browser it was
 * measured in, and whether the platform under it was a shipping one. Both reach
 * the published profile verbatim, so a permissive selector or a pre-release bit
 * that quietly reads "stable" would publish a claim no measurement supports.
 */

describe('parseRenderingBrowser', () => {
  test('defaults to the documented browser when no selector was given', () => {
    expect(parseRenderingBrowser(undefined)).toBe(DEFAULT_RENDERING_BROWSER);
  });

  test('accepts each browser the harness can launch', () => {
    expect(parseRenderingBrowser('chromium')).toBe('chromium');
    expect(parseRenderingBrowser('webkit')).toBe('webkit');
  });

  test('refuses a browser the harness cannot launch rather than falling back to the default', () => {
    expect(() => parseRenderingBrowser('firefox')).toThrow(/--browser must be one of \[chromium, webkit\]/);
  });
});

describe('classifyPrerelease', () => {
  test('reads a preview build off the browser version, without anyone declaring it', () => {
    const status = classifyPrerelease({ browserVersion: '154.0.8000.1-canary' });

    expect(status.value).toBe(true);
    expect(status.source).toBe('detected');
    expect(status.evidence).toContain('canary');
  });

  test('accepts a declaration for what it cannot read, and records it as declared', () => {
    const status = classifyPrerelease({ browserVersion: '26.5', declared: 'macOS 26.0 beta 3' });

    expect(status).toEqual({ value: true, source: 'declared', evidence: 'macOS 26.0 beta 3' });
  });

  test('records a bare declaration as one without a stated reason rather than inventing one', () => {
    expect(classifyPrerelease({ browserVersion: '26.5', declared: 'true' }).evidence).toBe('declared by the runner, without a stated reason');
  });

  test('prefers what it read over what was declared, so the evidence names the build', () => {
    const status = classifyPrerelease({ browserVersion: '26.5-beta', declared: 'macOS 26.0 beta 3' });

    expect(status.source).toBe('detected');
  });

  test('says the status was assumed, never that the platform is stable, when nothing established it', () => {
    const status = classifyPrerelease({ browserVersion: '151.0.7922.34' });

    expect(status).toEqual({
      value: false,
      source: 'assumed-stable',
      evidence: expect.stringContaining('cannot be read at runtime') as unknown as string,
    });
  });

  test('does not read a pre-release marker out of a plain version number', () => {
    expect(classifyPrerelease({ browserVersion: '151.0.7922.34' }).value).toBe(false);
    expect(classifyPrerelease({ browserVersion: '26.5' }).value).toBe(false);
  });
});
