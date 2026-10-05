/**
 * How each browser family is launched.
 *
 * `vitest.config.ts` runs the browser projects with these options and
 * `qualify.ts` probes the host with the very same ones, so a capability
 * preflight answers for the browser the suite is about to start rather than for
 * a browser that merely shares its name.
 *
 * Erasable TypeScript without imports, like the rest of `scripts/ci`.
 */

export type BrowserProfileId = 'chromium-webgl2' | 'chromium-webgpu' | 'firefox-webgl2' | 'firefox-webgpu';

export interface BrowserProfile {
  readonly id: BrowserProfileId;
  readonly browser: 'chromium' | 'firefox';
  readonly headless: boolean;
  readonly launchOptions: {
    readonly channel?: 'chromium';
    readonly args?: readonly string[];
    readonly firefoxUserPrefs?: Readonly<Record<string, boolean>>;
  };
}

/**
 * Chromium's WebGPU recipe. Both flags are load-bearing: `--enable-unsafe-webgpu`
 * (without it Linux resolves `requestAdapter()` to `null`, and it exposes optional
 * features such as `texture-compression-unaligned` everywhere) and
 * `--ignore-gpu-blocklist` (without it the adapter is granted but `requestDevice()`
 * rejects on a software or unrecognised GPU). The Linux runner ends up on Chromium's
 * bundled SwiftShader adapter (`isFallbackAdapter: true`); a developer machine gets
 * its own GPU.
 *
 * Deliberately absent: `--enable-features=Vulkan` and `--disable-vulkan-surface`
 * (no effect on the adapter or the results), `--no-sandbox` (Playwright launches
 * without the sandbox where the platform needs it) and the GPU-watchdog and
 * driver-bug-workaround switches, which only weaken the browser's own protections.
 * Forcing `--use-angle=vulkan` regressed `requestAdapter()` to `null` and is not used.
 */
export const CHROMIUM_WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] as const;

export const CHROMIUM_WEBGL2_ARGS = ['--enable-webgl', '--use-angle=swiftshader'] as const;

/**
 * `webgl.force-enabled` overrides the driver blocklist that rejects unknown CI
 * hardware, `gfx.webrender.software` selects the software backend, and
 * `webgl.disable-angle` keeps Windows on native OpenGL (through ANGLE every
 * context spends seconds compiling shaders and WARP has no MSAA). Linux and
 * macOS use native OpenGL either way.
 */
export const FIREFOX_WEBGL2_PREFS = {
  'webgl.force-enabled': true,
  'webgl.disabled': false,
  'gfx.webrender.software': true,
  'webgl.disable-angle': true,
} as const;

export type BrowserEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Headedness is part of the profile because it decides whether a context or an
 * adapter exists at all: Firefox on Linux has no WebGL headless, and Firefox
 * resolves `requestAdapter()` to `null` headless whatever the prefs say.
 */
export const browserProfile = (id: BrowserProfileId, env: BrowserEnvironment): BrowserProfile => {
  switch (id) {
    case 'chromium-webgl2':
      return {
        id,
        browser: 'chromium',
        headless: env['EXOJS_BROWSER_HEADED'] !== '1',
        launchOptions: { channel: 'chromium', args: CHROMIUM_WEBGL2_ARGS },
      };
    case 'chromium-webgpu':
      return {
        id,
        browser: 'chromium',
        headless: env['EXOJS_WEBGPU_CI_HEADED'] !== '1',
        launchOptions: { channel: 'chromium', args: CHROMIUM_WEBGPU_ARGS },
      };
    case 'firefox-webgl2':
      return {
        id,
        browser: 'firefox',
        headless: env['EXOJS_FIREFOX_CI_HEADED'] !== '1',
        launchOptions: { firefoxUserPrefs: FIREFOX_WEBGL2_PREFS },
      };
    case 'firefox-webgpu':
      return { id, browser: 'firefox', headless: false, launchOptions: {} };
  }
};

export const BROWSER_PROFILE_IDS: readonly BrowserProfileId[] = ['chromium-webgl2', 'chromium-webgpu', 'firefox-webgl2', 'firefox-webgpu'];
