// Lint policy for the documentation site.
//
// The site owns its environment - which files are React islands, which trees
// are generated or vendored - while the React rules themselves come from
// `@codexo/exojs-config`, shared with `packages/exojs-react`. Astro files are
// type-checked by `astro check` and are not linted here.
//
// ESLint resolves the config nearest to the file being linted, so this file
// governs `site/` whether the run starts here or at the repository root.
import { languageBaselineConfig, nodeToolingConfig } from '@codexo/exojs-config/eslint/base';
import { reactConfig } from '@codexo/exojs-config/eslint/react';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';

export default defineConfig([
  // `.astro/` is Astro's generated type/content cache and `public/` carries
  // vendored bundles and the copied example catalog - none of it is authored
  // here.
  // `.astro/` is Astro's generated type/content cache and `public/` carries
  // vendored bundles and the copied example catalog - none of it is authored
  // here. `scripts/` is authored, but has never been linted: it carries ~95
  // findings against this baseline, so bringing it in is its own change rather
  // than a side effect of moving the config.
  { ignores: ['.astro/**', 'dist/**', 'node_modules/**', 'public/**', 'scripts/**', 'src/generated/**'] },

  ...languageBaselineConfig({ tsconfigRootDir: import.meta.dirname }),

  ...reactConfig({ files: ['src/**/*.{ts,tsx}'], tsconfigRootDir: import.meta.dirname }),

  // The Astro/Codecov config files run under Node, outside the site's own
  // TypeScript program.
  ...nodeToolingConfig({ files: ['*.config.{ts,mjs,js}'] }),

  // Prettier compatibility: keep this last
  prettier,
]);
