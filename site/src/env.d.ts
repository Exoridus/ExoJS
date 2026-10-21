/// <reference types="astro/client" />

declare namespace JSX {
  type Element = import('react').ReactElement;
}

interface Window {
  __EXAMPLE_META__?: import('./lib/types').Example | null;
  __EXAMPLE_PREVIEW_ERROR_RENDERED__?: boolean;
  assets?: Record<string, unknown>;
}

declare module '*.scss?inline' {
  const content: string;
  export default content;
}

declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*?worker' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}

/** The site build identity the Astro config resolved; see `site/scripts/write-site-build.ts`. */
declare const __EXOJS_SITE_BUILD__: {
  readonly channel: 'stable' | 'next';
  readonly basePath: string;
  readonly sourceSha: string;
  readonly packageVersion: string;
  readonly assetProfile: string;
  readonly createdAt: string;
  readonly localTest: boolean;
  readonly counterpartBase: string | null;
};
