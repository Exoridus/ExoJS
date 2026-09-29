/**
 * Asks a browser, launched exactly as its test project launches it, what the
 * host can actually do.
 *
 * `navigator.gpu` being present proves nothing (Firefox exposes it headless and
 * still resolves `requestAdapter()` to `null`), so the probe goes as far as a
 * suite would: adapter, device, optional features and one decoded video frame.
 * Every wait is bounded, and the device and media fixture are released before
 * the browser closes. The page runs in a secure context, without which WebGPU
 * is not exposed at all.
 */
import { browserProfile, type BrowserProfileId } from './browser-profiles.ts';
import type { CapabilityResult, ProbeFailure, ProbeReport } from './capability.ts';

const PROBE_ORIGIN = 'https://exojs-probe.test/';
const PROBE_DEADLINE_MS = 90_000;
const BROWSER_CLOSE_MS = 10_000;

/**
 * Evaluated in the page. A string on purpose: a function passed to
 * `page.evaluate` is serialised after tsx has wrapped its inner functions in a
 * `__name` helper the page does not have.
 */
export const PAGE_PROBE = `(async () => {
  const withTimeout = (promise, ms, label) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' did not settle within ' + ms + ' ms')), ms))]);
  const message = error => (error && error.message ? error.message : String(error));
  const capabilities = {};
  const info = {};
  const record = (name, ok, detail) => { capabilities[name] = { ok, detail }; };

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) {
      record('webgl2', false, 'getContext("webgl2") returned null');
      record('webgl2-float-render', false, 'no WebGL2 context');
    } else {
      record('webgl2', true, String(gl.getParameter(gl.VERSION)));
      record('webgl2-float-render', gl.getExtension('EXT_color_buffer_float') !== null, 'EXT_color_buffer_float');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      if (debug) info['webgl2 renderer'] = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (error) {
    record('webgl2', false, message(error));
    record('webgl2-float-render', false, 'no WebGL2 context');
  }

  const features = ['texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc', 'float32-filterable'];
  if (typeof navigator.gpu === 'undefined') {
    record('webgpu-api', false, 'navigator.gpu is undefined');
  } else {
    record('webgpu-api', true, 'navigator.gpu present');
    let adapter = null;
    try {
      adapter = await withTimeout(navigator.gpu.requestAdapter(), 20000, 'requestAdapter()');
      record('webgpu-adapter', adapter !== null, adapter === null ? 'requestAdapter() resolved null' : 'adapter acquired');
    } catch (error) {
      record('webgpu-adapter', false, message(error));
    }
    if (adapter !== null) {
      const identity = adapter.info ?? {};
      info['webgpu adapter'] = [identity.vendor, identity.architecture, identity.device, identity.description].filter(Boolean).join(' / ') || 'not reported';
      info['webgpu features'] = [...adapter.features].sort().join(', ');
      for (const feature of features) record('feature:' + feature, adapter.features.has(feature), feature);
      try {
        const device = await withTimeout(adapter.requestDevice(), 20000, 'requestDevice()');
        record('webgpu-device', true, 'device acquired');
        device.destroy();
      } catch (error) {
        record('webgpu-device', false, message(error));
      }
    } else {
      record('webgpu-device', false, 'no adapter');
      for (const feature of features) record('feature:' + feature, false, 'no adapter');
    }
  }

  let video = null;
  let stream = null;
  let timer;
  try {
    const source = document.createElement('canvas');
    source.width = 16;
    source.height = 16;
    const ctx = source.getContext('2d');
    if (typeof source.captureStream !== 'function') {
      record('media-frame', false, 'HTMLCanvasElement.captureStream is unavailable');
    } else {
      const paint = () => { ctx.fillStyle = '#336699'; ctx.fillRect(0, 0, 16, 16); };
      paint();
      stream = source.captureStream(30);
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      const deadline = performance.now() + 10000;
      const frame = await new Promise(resolve => {
        video.play().catch(() => {});
        const poll = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) resolve('videoWidth=' + video.videoWidth);
          else if (performance.now() >= deadline) resolve(null);
          else { paint(); timer = setTimeout(poll, 16); }
        };
        poll();
      });
      record('media-frame', frame !== null, frame ?? 'no decoded frame within 10000 ms (readyState=' + video.readyState + ')');
    }
  } catch (error) {
    record('media-frame', false, message(error));
  } finally {
    clearTimeout(timer);
    if (video) { video.pause(); video.srcObject = null; }
    if (stream) stream.getTracks().forEach(track => track.stop());
  }

  return { browser: navigator.userAgent, capabilities, info };
})()`;

const isCapabilityResult = (value: unknown): value is CapabilityResult =>
  typeof value === 'object' && value !== null && typeof (value as CapabilityResult).ok === 'boolean' && typeof (value as CapabilityResult).detail === 'string';

/** Rejects a report the page returned in an unexpected shape rather than trusting it. */
export const parseProbeReport = (raw: unknown): ProbeReport | ProbeFailure => {
  if (typeof raw !== 'object' || raw === null) return { error: 'the page returned no report' };

  const { browser, capabilities, info } = raw as { browser?: unknown; capabilities?: unknown; info?: unknown };

  if (typeof browser !== 'string' || typeof capabilities !== 'object' || capabilities === null) return { error: 'the page returned a malformed report' };

  const entries = Object.entries(capabilities as Record<string, unknown>);

  if (!entries.every(([, value]) => isCapabilityResult(value))) return { error: 'the page returned a malformed capability entry' };

  const infoEntries =
    typeof info === 'object' && info !== null ? Object.entries(info as Record<string, unknown>).map(([key, value]) => [key, String(value)] as const) : [];

  return { browser, capabilities: Object.fromEntries(entries) as Record<string, CapabilityResult>, info: Object.fromEntries(infoEntries) };
};

const settle = async <T>(work: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([work, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms)))]);
  } finally {
    clearTimeout(timer);
  }
};

/** Runs {@link PAGE_PROBE} in the browser `profileId` names; never throws. */
export const probeBrowser = async (profileId: BrowserProfileId, env: NodeJS.ProcessEnv = process.env): Promise<ProbeReport | ProbeFailure> => {
  const profile = browserProfile(profileId, env);
  let browser: import('playwright').Browser | undefined;

  try {
    const playwright = await import('playwright');
    const { channel, args, firefoxUserPrefs } = profile.launchOptions;

    browser = await settle(
      playwright[profile.browser].launch({
        headless: profile.headless,
        ...(channel === undefined ? {} : { channel }),
        ...(args === undefined ? {} : { args: [...args] }),
        ...(firefoxUserPrefs === undefined ? {} : { firefoxUserPrefs: { ...firefoxUserPrefs } }),
      }),
      PROBE_DEADLINE_MS,
      'browser launch',
    );

    const page = await browser.newPage();

    await page.route(PROBE_ORIGIN, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }));
    await page.goto(PROBE_ORIGIN);

    return parseProbeReport(await settle(page.evaluate(PAGE_PROBE), PROBE_DEADLINE_MS, 'capability probe'));
  } catch (error) {
    return { error: error instanceof Error ? error.message.split('\n')[0]! : String(error) };
  } finally {
    // A wedged browser must not hold the qualification hostage; the launching
    // process owns it, so it goes down with this process either way.
    await settle(browser?.close() ?? Promise.resolve(), BROWSER_CLOSE_MS, 'browser close').catch(() => undefined);
  }
};
