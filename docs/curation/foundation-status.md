# Shared Playground foundation

The optional site caption and control bar share the website tokens and fit the presented CSS-pixel canvas size. The fit result includes the remaining scene height, compact mode, and scale. Bars reject more than four parameters or three actions before mounting. Status text is stable when unchanged; information, warning, success, and error have distinct semantic tones. Reduced-motion preferences disable the short parameter-change ring. Legacy panels remain compatible. Atlas cropping is opt-in and restricted to a verified one-texel border until extruded artwork exists.

## Verification

The four new helper regressions failed before implementation and pass afterward. The four named helper, declaration, and source-sync test files pass with 17 tests. Example typecheck, targeted ESLint, generated JavaScript/declaration synchronization and diff whitespace checks pass.

Real browser checks pass in Chromium WebGL2, Chromium WebGPU and Firefox WebGL2 at 1280x720 and 512x288: animation event timing, pause/step/reset, keyboard parity, native pointer capture, text wrap/style/font failure, hidden-preview recovery, readable controls and disposal. Each environment also passes the detached default-font check. The JSON records and PNG pairs are in [evidence/foundation](evidence/foundation/). Firefox WebGPU is not certified: the available Firefox exposes no usable adapter in the earlier pilot capability probe.

The generated-vendor setup initially failed because the new worktree had no generated demo-media output. Reusing the existing output and restarting the dev server after vendor generation resolved the missing declarations and fonts; all affected browser cases were then rerun successfully.

| Comparison | Before | After |
|---|---|---|
| Animation, compact | [Original](evidence/before-webgl2-frame-animation-512.png) | [Current](evidence/foundation/chromium-webgl2-frame-animation-512-startup.png) |
| Text, compact | [Original](evidence/before-webgl2-typographic-styling-512.png) | [Current](evidence/foundation/chromium-webgl2-typographic-styling-512-startup.png) |

The text wrap handle now ends above the first text row. Both pilot scenes use the shared fitter. No engine or renderer implementation changes are included.
