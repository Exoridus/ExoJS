import { formatOptions } from '@codexo/exojs-config/prettier';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...formatOptions,
  // Astro formatting uses the compiler installed at the repository root.
  astro: true,
  // Manifest field order is authored, just like import order (owned by ESLint).
  sortPackageJson: false,
});
