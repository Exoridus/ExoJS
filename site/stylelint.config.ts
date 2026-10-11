// Lint policy for the documentation site's styles: SCSS files, CSS Modules and
// the `<style>` blocks of Astro components.
//
// Prettier owns layout; this config owns correctness and the conventions that
// need the selector or value tree. The standard SCSS preset supplies the
// baseline, and every deviation below is a measured decision:
//
// Left at the preset's defaults - `declaration-block-no-duplicate-properties`,
// `no-duplicate-selectors`, `property-no-unknown`, malformed selectors and
// media queries, empty blocks - because the tree already satisfies them.
//
// Measured and deliberately NOT enabled (re-open by re-measuring):
//
//   hue-degree-notation, alpha-value-notation
//     123 reports, nearly all in the colour tokens. `oklch(62% 0.2 245)` and
//     `/ 0.45` are the idiom the tokens are written in; `245deg` and `45%` say
//     the same thing with more characters.
//   custom-property-empty-line-before
//     Blank lines in the token sheet separate groups of related tokens; the
//     rule wants them removed.
//   declaration-block-single-line-max-declarations
//     Prettier expands one-line blocks; stylelint cannot fix them and would make
//     a staged file fail before Prettier runs.
//   no-descending-specificity
//     20 reports whose fix is reordering rules, which changes the cascade and
//     cannot be verified without rendering every page.
//   selector-no-qualifying-type
//     31 reports, almost all `a.active` / `tr.section`, which are readable and
//     cost no specificity worth the rewrite.
//   color-named
//     `white` / `black` in three overlay rules.
//   order/properties-order (stylelint-order)
//     800 reports across 50 files for a convention the tree already follows
//     loosely; the autofix detaches declarations from the comments written above
//     them and reorders shorthand and longhand pairs.
//   max-nesting-depth below 2 and selector-max-compound-selectors below 4
//     Present usage tops out at depth 1 and four compounds.
//
// Custom-property validation reads every `--name:` declaration under `src/`
// (styles, components and inline style props), so a variable that is used but
// declared nowhere - a typo - is reported without maintaining a list.
import { globSync, readFileSync } from 'node:fs';

import type { Config } from 'stylelint';

// Class names: kebab-case words with an optional BEM-style `__element` and
// `--modifier`. CSS Modules and component styles share the pattern; a plain
// `.root` or `.error` is a one-word block and matches it as well.
const CLASS_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/u;

// Properties a stylesheet legitimately reads without declaring: Shiki writes
// them as inline styles on every highlighted token.
const EXTERNAL_CUSTOM_PROPERTIES = ['--shiki-dark', '--shiki-light'];

const declaredCustomProperties = (): Record<string, string> => {
  const declared: Record<string, string> = {};

  for (const name of EXTERNAL_CUSTOM_PROPERTIES) {
    declared[name] = 'external';
  }

  for (const file of globSync('src/**/*.{scss,css,astro,ts,tsx}', { cwd: import.meta.dirname })) {
    const source = readFileSync(`${import.meta.dirname}/${file}`, 'utf8');

    for (const match of source.matchAll(/['"]?(--[A-Za-z0-9_-]+)['"]?\s*:/gu)) {
      declared[match[1]] = 'declared';
    }
  }

  return declared;
};

const config: Config = {
  extends: ['stylelint-config-standard-scss'],
  plugins: ['stylelint-value-no-unknown-custom-properties'],
  ignoreFiles: ['dist/**', '.astro/**', 'node_modules/**', 'public/**', 'src/generated/**', 'src/content/api/**'],
  reportNeedlessDisables: true,
  reportInvalidScopeDisables: true,
  reportDescriptionlessDisables: true,
  overrides: [{ files: ['**/*.astro'], customSyntax: 'postcss-html' }],
  rules: {
    'alpha-value-notation': null,
    'hue-degree-notation': null,
    'custom-property-empty-line-before': null,
    'declaration-block-single-line-max-declarations': null,

    'selector-class-pattern': [
      CLASS_NAME,
      {
        resolveNestedSelectors: true,
        message: selector => `Expected class selector "${selector}" to be kebab-case with optional __element and --modifier`,
      },
    ],
    // `:global()` is CSS Modules and Astro syntax; `:local` is its inverse.
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'local'] }],
    // `-webkit-` is still the only spelling that works in some engines.
    'property-no-vendor-prefix': [true, { ignoreProperties: ['-webkit-box-decoration-break', '-webkit-user-select'] }],

    'declaration-no-important': true,
    'selector-max-id': 0,
    'selector-max-compound-selectors': 4,
    'max-nesting-depth': [2, { ignoreAtRules: ['media', 'supports', 'container', 'include'] }],

    'csstools/value-no-unknown-custom-properties': [true, { importFrom: [{ customProperties: declaredCustomProperties() }] }],
  },
};

export default config;
