import { rewriteSiteHref, SOURCE_LINK_BASE } from '../src/lib/site-links.ts';

/**
 * Guide and API sources link site pages through the Stable base
 * (`/ExoJS/en/guide/...`), the form `test/site/guide-prose-links.test.ts`
 * validates. This Markdown syntax-tree plugin moves Markdown links,
 * definitions and images onto the base the build targets, before rendering,
 * so a Next build never links into Stable and no finished file is rewritten
 * afterwards. Code and prose that merely mention the path stay as written.
 *
 * Components that take a page link as a prop (`NextStep`) apply the same
 * rewrite themselves; the Markdown processor cannot change JSX attributes.
 */

export { rewriteSiteHref };

interface UrlNode {
  readonly url: string;
}

interface VisitorContext {
  setProperty(node: unknown, key: string, value: unknown): void;
}

/**
 * The Satteri mdast plugin for a build at `basePath`, or `null` for the
 * Stable base, where every source link is already correct.
 */
export const siteBaseLinksPlugin = (basePath: string) => {
  if (basePath === SOURCE_LINK_BASE) {
    return null;
  }

  const rewriteUrl = (node: UrlNode, context: VisitorContext): void => {
    const url = rewriteSiteHref(node.url, basePath);

    if (url !== node.url) {
      context.setProperty(node, 'url', url);
    }
  };

  return { name: 'exojs-site-base-links', link: rewriteUrl, definition: rewriteUrl, image: rewriteUrl };
};

interface MarkdownProcessorLike {
  readonly name: string;
  readonly options?: { readonly mdastPlugins?: unknown[] };
}

/**
 * Adds the plugin to the configured Markdown processor, which MDX inherits.
 * Throws for a non-Stable base when the processor is not Satteri: building
 * Next without the rewrite would ship links into Stable.
 */
export const installSiteBaseLinks = (processor: MarkdownProcessorLike, basePath: string): void => {
  const plugin = siteBaseLinksPlugin(basePath);

  if (plugin === null) {
    return;
  }

  if (processor.name !== 'satteri' || !Array.isArray(processor.options?.mdastPlugins)) {
    throw new Error(`[site-base-links] cannot add the base link rewrite to the ${JSON.stringify(processor.name)} Markdown processor`);
  }

  processor.options.mdastPlugins.push(plugin);
};
