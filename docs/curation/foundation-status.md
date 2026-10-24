# Shared Playground foundation

The optional site caption and control bar share the website tokens and fit the presented CSS-pixel canvas size. The fit result includes the remaining scene height, compact mode, and scale. Bars reject more than four parameters or three actions before mounting. Status text is stable when unchanged; information, warning, success, and error have distinct semantic tones. Reduced-motion preferences disable the short parameter-change ring. Legacy panels remain compatible. Atlas cropping is opt-in and restricted to a verified one-texel border until extruded artwork exists.

## Verification

The four new helper regressions failed before implementation and pass afterward. The four named helper, declaration, renderer-state and research regression test files pass with 20 tests. Example typecheck, targeted ESLint, generated JavaScript/declaration synchronization and diff whitespace checks pass.

Real browser checks pass in Chromium WebGL2, Chromium WebGPU and Firefox WebGL2 at 1280x720 and 512x288: animation event timing, pause/step/reset, keyboard parity, native pointer capture, text wrap/style/font failure, hidden-preview recovery, readable controls and disposal. Each environment also passes the detached default-font check. The JSON records and PNG pairs are in [evidence/foundation](evidence/foundation/). Firefox WebGPU is not certified: the available Firefox exposes no usable adapter in the earlier pilot capability probe.

The generated-vendor setup initially failed because the new worktree had no generated demo-media output. Reusing the existing output and restarting the dev server after vendor generation resolved the missing declarations and fonts; all affected browser cases were then rerun successfully.

| Comparison         | Before                                                         | After                                                                              |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Animation, compact | [Original](evidence/before-webgl2-frame-animation-512.png)     | [Current](evidence/foundation/chromium-webgl2-frame-animation-512-startup.png)     |
| Text, compact      | [Original](evidence/before-webgl2-typographic-styling-512.png) | [Current](evidence/foundation/chromium-webgl2-typographic-styling-512-startup.png) |

The text wrap handle now ends above the first text row. Both pilot scenes use the shared fitter. No engine or renderer implementation changes are included.

## Research corrections

The pointer guide now converts clockwise gesture radians to counterclockwise SceneNode degrees. The retained-container diagnostic reads completed CPU frame cost in a scene-owned postFrame system, after the backend flush, and no longer attributes whole-frame timing to isolated collection or GPU time. Three regressions reproduce the former wrong rotation and zero-time measurement, then pass with the correction. Real touch hardware and comparative performance measurements remain unverified.

## Renderer reporting

The preview reports requested, initializing, active, fallback and failed states separately. Actual renderer text appears only after successful startup. The two pilot scenes use the shared start boundary; unsupported legacy sources are labelled as unreported rather than guessed from API presence. Real Chromium runs force a missing WebGPU adapter: auto selection starts WebGL2 and explains the adapter failure, while explicit WebGPU remains failed with no active renderer. WebGPU API presence and the probed adapter are deliberately separate inputs. Device/context loss and restoration callbacks have focused unit coverage; physical GPU device loss is not certified.

Two independent review findings have real Chromium red/green regressions: changing examples now clears renderer status and detaches outgoing listeners while source loading is pending or fails; an ordinary application exception preserves the successfully initialized renderer while the existing output records the execution error. The separate [lifecycle runner](../../site/scripts/curation-renderer-lifecycle-e2e.ts) and [before/after records](evidence/foundation/lifecycle/) cover both cases.
