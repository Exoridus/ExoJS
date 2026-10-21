import { describe, expect, it } from 'vitest';

import { installSiteBaseLinks, rewriteSiteHref, siteBaseLinksPlugin } from '../../site/scripts/site-base-links';

/**
 * Guide sources link pages as `/ExoJS/<locale>/...`, the Stable base. A Next
 * build rewrites those links in the Markdown syntax tree during the build, so
 * its pages stay under `/ExoJS/next/` without touching the finished output.
 */

describe('rewriteSiteHref', () => {
  it('moves a source-base link onto the build base', () => {
    expect(rewriteSiteHref('/ExoJS/en/guide/', '/ExoJS/next/')).toBe('/ExoJS/next/en/guide/');
    expect(rewriteSiteHref('/ExoJS/', '/ExoJS/next/')).toBe('/ExoJS/next/');
    expect(rewriteSiteHref('/ExoJS/en/api/sprite/#methods', '/ExoJS/next/')).toBe('/ExoJS/next/en/api/sprite/#methods');
  });

  it('leaves Stable links, external links and lookalikes alone', () => {
    expect(rewriteSiteHref('/ExoJS/en/guide/', '/ExoJS/')).toBe('/ExoJS/en/guide/');
    expect(rewriteSiteHref('https://exoridus.github.io/ExoJS/en/', '/ExoJS/next/')).toBe('https://exoridus.github.io/ExoJS/en/');
    expect(rewriteSiteHref('/ExoJSX/en/', '/ExoJS/next/')).toBe('/ExoJSX/en/');
    expect(rewriteSiteHref('#anchor', '/ExoJS/next/')).toBe('#anchor');
    expect(rewriteSiteHref('../relative/', '/ExoJS/next/')).toBe('../relative/');
  });
});

describe('siteBaseLinksPlugin', () => {
  const run = (plugin: NonNullable<ReturnType<typeof siteBaseLinksPlugin>>, node: Record<string, unknown>): Record<string, unknown> => {
    const updates: Record<string, unknown> = {};
    const context = { setProperty: (_node: unknown, key: string, value: unknown) => (updates[key] = value) };
    const visitor = (plugin as unknown as Record<string, (node: unknown, context: unknown) => void>)[node['type'] as string];
    visitor?.(node, context);

    return updates;
  };

  it('rewrites links, definitions and images', () => {
    const plugin = siteBaseLinksPlugin('/ExoJS/next/')!;
    expect(run(plugin, { type: 'link', url: '/ExoJS/en/guide/setup/' })).toEqual({ url: '/ExoJS/next/en/guide/setup/' });
    expect(run(plugin, { type: 'definition', url: '/ExoJS/de/api/' })).toEqual({ url: '/ExoJS/next/de/api/' });
    expect(run(plugin, { type: 'image', url: '/ExoJS/brand/logo.svg' })).toEqual({ url: '/ExoJS/next/brand/logo.svg' });
  });

  it('changes nothing that needs no change and never visits code', () => {
    const plugin = siteBaseLinksPlugin('/ExoJS/next/')!;
    expect(run(plugin, { type: 'link', url: 'https://example.com/ExoJS/' })).toEqual({});
    expect('code' in plugin || 'inlineCode' in plugin || 'text' in plugin).toBe(false);
  });

  it('is left out of a Stable build', () => {
    expect(siteBaseLinksPlugin('/ExoJS/')).toBeNull();
  });
});

describe('installSiteBaseLinks', () => {
  it('adds the plugin to a Satteri processor', () => {
    const processor = { name: 'satteri', options: { mdastPlugins: [] as unknown[] } };
    installSiteBaseLinks(processor, '/ExoJS/next/');
    expect(processor.options.mdastPlugins).toHaveLength(1);
  });

  it('refuses a processor it cannot extend, so a Next build never ships Stable links', () => {
    expect(() => installSiteBaseLinks({ name: 'unified', options: {} }, '/ExoJS/next/')).toThrow(/processor/);
    expect(() => installSiteBaseLinks({ name: 'unified', options: {} }, '/ExoJS/')).not.toThrow();
  });
});
