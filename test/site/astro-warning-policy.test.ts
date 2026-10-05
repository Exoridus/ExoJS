import { describe, expect, it } from 'vitest';

import { isGeneratedAstroDirective } from '../../site/scripts/astro-warning-policy.ts';

const content = '/project/site/src/content';
const generated = {
  code: 'MODULE_LEVEL_DIRECTIVE',
  id: `${content}/guide/example.mdx?astroPropagatedAssets`,
  message: 'The semantics of the module level directive "use astro:head-inject" may not be preserved when bundling.',
};

describe('generated Astro warning policy', () => {
  it('matches only the head-inject directive in a propagated MDX content module', () => {
    expect(isGeneratedAstroDirective(generated, content)).toBe(true);
    expect(
      isGeneratedAstroDirective(
        { ...generated, id: 'C:\\project\\site\\src\\content\\guide\\example.mdx?astroPropagatedAssets' },
        'C:\\project\\site\\src\\content',
      ),
    ).toBe(true);
  });

  it.each([
    { code: 'UNRESOLVED_IMPORT' },
    { id: `${content}/guide/example.mdx` },
    { id: '/project/site/src/components/example.mdx?astroPropagatedAssets' },
    { id: '/project/site/src/content-other/example.mdx?astroPropagatedAssets' },
    { id: `${content}/guide/example.ts?astroPropagatedAssets` },
    { id: `${content}/guide/example.mdx?astroPropagatedAssets&other` },
    { id: `${content}/../components/example.mdx?astroPropagatedAssets` },
    { id: undefined },
    { message: 'The semantics of the module level directive "use client" may not be preserved.' },
    { message: 'The module level directive "use client" has source text containing "use astro:head-inject".' },
  ])('preserves other warning classes, source modules, and directives: %j', override => {
    expect(isGeneratedAstroDirective({ ...generated, ...override }, content)).toBe(false);
  });
});
