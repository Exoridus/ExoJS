/**
 * Formatting options shared by Oxfmt and the Prettier-backed generators.
 * @satisfies {import('prettier').Config}
 */
export const formatOptions = {
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
};

/** @type {import('prettier').Config} */
const config = {
  ...formatOptions,
  // Resolved here rather than by name: Prettier looks plugin names up from the
  // directory it runs in, which for a nested package is not this one.
  plugins: [import.meta.resolve('prettier-plugin-astro')],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};

export default config;
