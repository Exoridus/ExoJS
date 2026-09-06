import { classifyPrerelease, DEFAULT_RENDERING_BROWSER, parsePlatformDeclaration, parseRenderingBrowser } from '../src/shared/provenance';

/**
 * The provenance decisions a run cannot take back: which browser it was
 * measured in, which operating-system version it ran on, and whether that
 * platform was a shipping one. All three reach the published profile verbatim
 * and two of them reach its file name, so a permissive selector, an unvalidated
 * version or a pre-release bit that quietly reads "stable" would publish a
 * claim no measurement supports.
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

  test('rests on the declaration alone for a domain that drives no browser', () => {
    expect(classifyPrerelease({ declared: `the runner declared the platform as '27-beta'` })).toEqual({
      value: true,
      source: 'declared',
      evidence: `the runner declared the platform as '27-beta'`,
    });
    expect(classifyPrerelease({}).source).toBe('assumed-stable');
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

describe('parsePlatformDeclaration', () => {
  test('reads a shipping platform and a pre-release one from the same flag', () => {
    expect(parsePlatformDeclaration('11')).toEqual({ major: 11, prerelease: false, raw: '11' });
    expect(parsePlatformDeclaration('27-beta')).toEqual({ major: 27, prerelease: true, raw: '27-beta' });
  });

  test('is absent when the flag was not passed, so a platform that reports its own version needs nothing', () => {
    expect(parsePlatformDeclaration(undefined)).toBeUndefined();
  });

  test.each(['macos', 'true', '10.0.26200', '0', '100', '27-preview', '27 beta', ''])('refuses %s, which is not a plausible major version', raw => {
    expect(() => parsePlatformDeclaration(raw)).toThrow(/major version/);
  });
});
