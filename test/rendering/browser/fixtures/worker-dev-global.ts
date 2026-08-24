// The worker-realm counterpart of `_setup-dev-global.ts`: the browser projects
// install the engine's compile-time build flags as real globals through a setup
// file, and a setup file only runs in the page. A worker that hosts the engine
// needs them in its own realm before any engine module evaluates.
const scope = globalThis as typeof globalThis & { __DEV__?: boolean; __VERSION__?: string; __REVISION__?: string };

scope.__DEV__ ??= true;
scope.__VERSION__ ??= '0.0.0';
scope.__REVISION__ ??= 'test';
