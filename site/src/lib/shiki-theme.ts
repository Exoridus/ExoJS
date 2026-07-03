/**
 * Single source of truth for the Shiki syntax-highlighting themes used across
 * the site — Markdown/MDX code fences (via astro.config markdown.shikiConfig)
 * and the <SourceSnippet> component's <Code>. Change the theme pair here and
 * every highlighted code block on the site updates. The two keys map to the
 * light and dark color schemes; Astro emits both and switches via the
 * `data-theme` attribute.
 */
export const SHIKI_THEMES = {
    light: 'github-light',
    dark: 'github-dark',
} as const;
