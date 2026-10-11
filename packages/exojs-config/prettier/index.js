/**
 * Shared Prettier options for the ExoJS monorepo.
 * @type {import('prettier').Config}
 */
const config = {
  printWidth: 140,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  quoteProps: 'as-needed',
  bracketSpacing: true,
  arrowParens: 'avoid',
  endOfLine: 'lf',
  // Resolved here rather than by name: Prettier looks plugin names up from the
  // directory it runs in, which for a nested package is not this one.
  plugins: [import.meta.resolve('prettier-plugin-astro')],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};

export default config;
