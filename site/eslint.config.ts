// Lint policy for the documentation site.
//
// The site owns its environment - which files are React islands or Astro
// components, which trees are generated or vendored - while the React rules
// themselves come from `@codexo/exojs-config`, shared with `packages/exojs-react`.
// Each tool has one job: `astro check` type-checks components, this config lints
// their frontmatter, template and accessibility, Stylelint (`stylelint.config.ts`)
// owns their `<style>` blocks and the stylesheets, and Prettier owns layout.
//
// ESLint resolves the config nearest to the file being linted, so this file
// governs `site/` whether the run starts here or at the repository root. The
// repository's `lint:site` delegates to the site's own `lint` script rather
// than globbing into `site/` from the root: the scope then lives once, in the
// `ignores` entry below, instead of in a root glob that has to be kept in step
// with it.
import { languageBaselineConfig, nodeToolingConfig } from '@codexo/exojs-config/eslint/base';
import { reactConfig } from '@codexo/exojs-config/eslint/react';
import { authoringStyleConfig, prettierCompatConfig } from '@codexo/exojs-config/eslint/style';
import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // `.astro/` is Astro's generated type/content cache and `public/` carries
  // vendored bundles and the copied example catalog - none of it is authored
  // here.
  { ignores: ['.astro/**', 'dist/**', 'node_modules/**', 'public/**', 'src/generated/**'] },

  ...languageBaselineConfig({ tsconfigRootDir: import.meta.dirname }),

  // The Astro parser exposes each component's script as a virtual `<name>.astro/<n>.ts`
  // file, which the `src/**/*.ts` glob would otherwise hand to the type-aware React rules.
  ...reactConfig({ files: ['src/**/*.{ts,tsx}'], tsconfigRootDir: import.meta.dirname }).map(block => ({
    ...block,
    ignores: ['**/*.astro/**'],
  })),

  // Astro components: frontmatter, template expressions and inline scripts.
  // Type information is not available for them (`astro check` owns that), so
  // the type-aware baseline is switched off for exactly these files.
  ...astro.configs['flat/recommended'],
  ...astro.configs['flat/jsx-a11y-strict'],
  ...authoringStyleConfig({ files: ['src/**/*.astro'] }),
  { files: ['**/*.astro', '**/*.astro/*.{js,ts}'], ...tseslint.configs.disableTypeChecked },

  // Beyond the recommended set, each measured against the components:
  //
  // - `no-set-html-directive`: no component injects raw HTML today; a new one
  //   should have to justify it. `valid-compile` surfaces Astro compiler errors
  //   at lint time.
  // - `prefer-class-list-directive`: conditional classes use `class:list`.
  //
  // Measured and deliberately NOT enabled (re-open by re-measuring):
  //
  // - `no-unused-css-selector`: 19 reports, about half of them selectors for
  //   state a script sets at runtime (`data-active`, `.is-exiting`) or for
  //   siblings across component instances. The rule cannot see either, and a
  //   disable comment inside `<style>` is not honoured, so every legitimate
  //   selector would need the whole block silenced.
  // - `no-unsafe-inline-scripts`: 15 reports for Astro's own inline `<script>`
  //   bundling; the site ships no Content-Security-Policy that would care.
  // - `sort-attributes`: 234 reports of pure reordering with no behavioural or
  //   readability gain.
  // - `no-set-text-directive`, `prefer-object-class-list`, `prefer-split-class-list`,
  //   `no-omitted-end-tags`, `semi`: no findings to protect against, or a
  //   Prettier decision.
  {
    files: ['**/*.astro'],
    rules: {
      'astro/no-set-html-directive': 'error',
      'astro/prefer-class-list-directive': 'error',
      'astro/valid-compile': 'error',
    },
  },

  // The Astro/Codecov config files and the site's build/sync tooling run under
  // Node, outside the site's own TypeScript program. `tsconfig.json` covers
  // `src` only, so type-aware rules have no program to ask and would fail to
  // load; `site/tsconfig.scripts.json` type-checks `scripts/` separately.
  ...nodeToolingConfig({ files: ['*.config.{ts,mjs,js}', 'scripts/**/*.ts'] }),

  // The site's tooling reports progress on stdout by design, the same way the
  // repository's own scripts do.
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Prettier compatibility: keep this last. It also re-enables `curly`,
  // which Prettier compatibility would otherwise leave off.
  ...prettierCompatConfig({ files: ['src/**/*.{ts,tsx,astro}', '*.config.{ts,mjs,js}', 'scripts/**/*.ts'] }),
]);
