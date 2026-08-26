// Lint policy for the React integration package.
//
// The package owns its own environment - TSX, React globals, the hooks rules,
// and the relaxations a binding around an imperative handle needs - while the
// rules themselves come from `@codexo/exojs-config`, so the site's React
// islands and this package are held to one policy rather than two that drift.
//
// ESLint resolves the config nearest to the file being linted, so this file
// governs the package whether the run starts here (`pnpm --filter
// @codexo/exojs-react lint`) or at the repository root.
import { languageBaselineConfig, nodeToolingConfig } from '@codexo/exojs-config/eslint/base';
import { extensionSourceConfig } from '@codexo/exojs-config/eslint/extension';
import { packageTestConfig } from '@codexo/exojs-config/eslint/package-test';
import { reactConfig, reactImperativeBindingConfig } from '@codexo/exojs-config/eslint/react';
import { vitestConfig } from '@codexo/exojs-config/eslint/vitest';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';

const SOURCE = ['src/**/*.{ts,tsx}'];
const EXAMPLES = ['examples/**/*.{ts,tsx}'];
const TESTS = ['test/**/*.{ts,tsx}'];

export default defineConfig([
  { ignores: ['dist/**', 'node_modules/**'] },

  ...languageBaselineConfig({ tsconfigRootDir: import.meta.dirname }),

  // The package is an extension package first: its `.ts` modules are held to
  // the same engine policy as every other `packages/exojs-*/src` tree. `.tsx`
  // is deliberately absent here - a component file is React code, and the
  // React policy below is what governs it.
  ...extensionSourceConfig({ files: ['src/**/*.ts'], tsconfigRootDir: import.meta.dirname }),

  ...reactConfig({ files: SOURCE, tsconfigRootDir: import.meta.dirname }),
  ...reactImperativeBindingConfig({ files: SOURCE }),

  // React passes component and class references as PascalCase parameters
  // (`SceneClass`), which is the ecosystem's spelling for "this argument is a
  // constructor", not a naming slip.
  {
    files: SOURCE,
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'parameter',
          format: ['strictCamelCase', 'StrictPascalCase'],
          leadingUnderscore: 'allow',
        },
      ],
    },
  },

  // This config file is in no TypeScript program of its own.
  ...nodeToolingConfig({ files: ['*.config.ts'] }),

  // `<Scene name component>` renders nothing: it is a declaration the parent
  // `<Scenes>` reads through Children.forEach, so its props are consumed one
  // level up and no rule can see that from the component itself.
  {
    files: ['src/Scenes.tsx'],
    rules: {
      '@eslint-react/no-unused-props': 'off',
    },
  },

  // Guide sources (examples/guides/**) - the listings the React chapter embeds
  // regions of. They are React code, so the React policy governs them.
  ...reactConfig({ files: EXAMPLES, tsconfigRootDir: import.meta.dirname }),
  {
    files: EXAMPLES,
    languageOptions: {
      // Named project rather than the project service: the service resolves the
      // nearest `tsconfig.json`, which is the package's own program over
      // `src/**` and does not contain these files. The React rules that need
      // type information - `no-implicit-key` among them - fail to load without
      // a program, so pointing at the right one is what keeps them on.
      parserOptions: { projectService: false, project: './tsconfig.examples.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A listing names what it demonstrates and stops there: the headless-hook
      // listing destructures both `app` and `canvasRef` because the chapter's
      // point is that the hook returns both. Renaming to `_app` would put the
      // workaround in the documentation. A stale IMPORT is still an error -
      // that one is drift, not narration.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
  },

  ...packageTestConfig({ files: TESTS }),
  ...vitestConfig({ files: TESTS }),

  // Prettier compatibility: keep this last
  prettier,
]);
