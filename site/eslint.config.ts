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
  { ignores: ['.astro/**', 'dist/**', 'node_modules/**', 'public/**', 'src/generated/**'] },

  ...languageBaselineConfig({ tsconfigRootDir: import.meta.dirname }),

  ...reactConfig({ files: ['src/**/*.{ts,tsx}'], tsconfigRootDir: import.meta.dirname }),

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

  // Function style is a repository-wide convention. The engine and the
  // extension packages get it from the shared correctness rules; the site has
  // its own config, so it carries the rule itself.
  {
    files: ['src/**/*.{ts,tsx}', '*.config.{ts,mjs,js}', 'scripts/**/*.ts'],
    rules: {
      'func-style': ['error', 'expression'],
    },
  },

  // Prettier compatibility: keep this last
  prettier,
]);
