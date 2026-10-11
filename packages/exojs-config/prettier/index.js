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
};

export default config;
