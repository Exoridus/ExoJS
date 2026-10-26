// @vitest-environment node
import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

import type { Example } from '../../site/src/lib/types';
import { configureUrls } from '../../site/src/lib/url-builder';

const { Editor } = await vi.importActual<{ Editor: (props: Record<string, unknown>) => unknown }>('../../site/src/components/Editor');
const { EditorPreview } = await vi.importActual<{ EditorPreview: (props: Record<string, unknown>) => unknown }>(
  '../../site/src/components/EditorPreview',
);

configureUrls({ baseUrl: 'https://example.test/ExoJS/' });

const siteRequire = createRequire(new URL('../../site/package.json', import.meta.url));
const { createElement, createRef } = siteRequire('react');
const { renderToStaticMarkup } = siteRequire('react-dom/server');

const example: Example = {
  slug: 'retro-display',
  path: 'filters/crt-scanlines.js',
  title: 'Retro Display',
  description: 'Compare scanlines, grain and RGB separation on the same image.',
  backend: 'core',
  section: 'effects',
  language: 'typescript',
  level: 'intermediate',
  apiLinks: ['shader-filter'],
};

const render = (): string =>
  renderToStaticMarkup(
    createElement(Editor, {
      activeExample: example,
      catalogLoadError: null,
      selectedVersionId: 'current',
      showSidebarToggle: false,
      sidebarOpen: true,
      sidebarToggleRef: createRef(),
      onToggleSidebar: () => undefined,
    }),
  );

describe('playground presentation', () => {
  it('starts with the demo above the editor before browser preferences are applied', () => {
    expect(render()).toContain('data-layout="stacked"');
  });

  it('explains the full example title and learning goal before the preview', () => {
    const html = render();

    expect(html).toMatch(/<h1[^>]*>Retro Display<\/h1>/);
    expect(html).toContain(example.description);
    expect(html.indexOf(example.description)).toBeLessThan(html.indexOf('aria-label="Example preview"'));
  });

  it('gives the isolated preview an accessible example-specific title', () => {
    const html = renderToStaticMarkup(
      createElement(EditorPreview, { sourceCode: 'console.log("ready")', exampleMeta: example, selectedVersionId: 'current' }),
    );

    expect(html).toContain('title="Live demo: Retro Display"');
    expect(html).toContain('<iframe');
  });

  it('offers an accessible divider and narrow-screen Demo and Code views', () => {
    const html = render();

    expect(html).toContain('aria-label="Resize preview and editor"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('>Demo</button>');
    expect(html).toContain('>Code</button>');
  });

  it('keeps a stable header without a duplicate information panel', () => {
    const html = render();
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(header).toContain('data-example-header');
    expect(header).toContain('data-header-row="primary"');
    expect(header).toContain('data-header-row="context"');
    expect(header).not.toMatch(/<summary[^>]*>Info<\/summary>/);
    expect(header).not.toContain('<h2');
    expect(header).toContain('aria-label="Example view"');
  });

  it('keeps unknown renderer diagnostics out of the presentation', () => {
    expect(render()).not.toContain('Renderer not reported');
  });

  it('does not reserve a console row before anything has been logged', () => {
    expect(render()).not.toContain('No messages');
  });

  it('links the APIs explicitly taught by this example before chapter-wide suggestions', () => {
    expect(render()).toContain('/en/api/shader-filter/');
  });
});
