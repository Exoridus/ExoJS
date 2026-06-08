// The globally-injected, typed example asset catalog. Example authors use the
// `assets` global directly with full autocomplete and type safety — no import:
//
//   assets.demo.textures.particleFlame;
//   assets.technical.alpha.alphaEdgeStraight;
//
// The value is installed on `globalThis`/`window` by the controlled example
// runtimes (Playground iframe, Example/Guide preview, Asset Browser, smoke
// harness, Full Release harness) BEFORE the example module evaluates. It is NOT
// part of the engine public API and is unavailable in normal consumer apps.
import type { Assets } from '../assets/assets';

declare global {
  const assets: Assets;

  interface Window {
    readonly assets: Assets;
  }
}

export {};
