// @vitest-environment node
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { Editor, type EditorProps } from '../../site/src/components/Editor';
import { EditorPreview } from '../../site/src/components/EditorPreview';
import { configureUrls } from '../../site/src/lib/url-builder';

configureUrls({ baseUrl: 'https://example.test/ExoJS/' });

const siteRequire = createRequire(new URL('../../site/package.json', import.meta.url));
const { createElement, createRef } = siteRequire('react');
const { renderToStaticMarkup } = siteRequire('react-dom/server');

const example: NonNullable<EditorProps['activeExample']> = {
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
