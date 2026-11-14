# Competitive ExoJS benchmark: presentation-inclusive structural baseline

Qualified: 2026-11-14, [CI software structural gate](https://github.com/Exoridus/ExoJS/actions/runs/43640838811/job/132588058055), candidate branch `fix/bench-exojs-presentation`, measured on commit `b322fa8c8c332f943a2adc4d9c970405614e4c19`.

## Why counters changed

Earlier ExoJS competitive measurements called `app.rendering.render(root)` and `backend.flush()` against the canvas, bypassing the engine's final output transform. The result lacked sRGB encoding and omitted its GPU work.

The new adapter draws to an `Rgba8Srgb` working target, resolves it and executes the existing `OutputTransform.present` as part of each measured frame. Exactly **60/60 guarded cells completed** in the above software-rasterizer qualification; the historical baseline differed in **126 structural counters**. Every updated value in `baselines/structural.json` is parsed from an actual `OLD -> NEW` CI result and checked against the prior baseline. These figures were not predicted or chosen to make the gate pass.

The previous, exact `0.18.0` baseline is retained at `baselines/structural-pre-presentation.json` for auditability. Do not compare its absolute counters or timings with the new presentation-inclusive measurements.

## Important nonconstant workload

Most cells gained one final fullscreen presentation draw. Three specific archetypes (`mixed-blend`, `mixed-material`, `mixed-material-atlased`) moved from 8 to **135** draws for either ExoJS arm at the gate load of 200, with substantial corresponding texture-bind/upload increases.

This is **not** simply a presentation draw. The root canvas in the historical direct path had an opaque-destination guarantee; the normal Application working `RenderTexture` does not. `RenderPlanBuilder` conditionally routes `BlendModes.Multiply` through backdrop-aware composition when the destination is not guaranteed opaque. That costs additional draws and intermediate operations. Do **not** set `presentationTarget.opaqueDestination=true` to restore the old fast path: an offscreen target has an alpha channel and claiming the wrong coverage would hide production work and may violate blending semantics. The structural gate must compare like with like.

## Measurement contract and remaining qualification

- These counters are an **ExoJS-only** software-rasterizer regression baseline, not a comparison against PixiJS/Phaser and not GPU timings.
- `drawCalls`, `textureBinds`, `bufferUploads` retain exact integer gates, with no relaxation.
- The existing 58 per-frame + 2 three-frame-total cell bases and all 60 guarded cells remain unchanged.
- Browser bloom qualification compares the unfiltered **same white input** scene with the unchanged strict pixel thresholds; separately, both blur paths must increase at least 1,000 pixels. Their blurred brightness is **not** asserted pixel-identical, because the two libraries perform blur in different intermediate color representations. The first post-presentation run correctly surfaced a maximum 80-code-value mismatch in the old absolute bloom comparison. This is a recorded cross-engine limitation, not proof of an ExoJS output-encode defect.
- Hardware color/pixel parity for representative workloads on WebGL2 and WebGPU, independently known Pixi tilemap issues and the Phaser high-load limit remain separately qualified.
- Publication-quality cross-engine performance claims require new hardware acquisitions with appropriate version, adapter, display and profile provenance.
