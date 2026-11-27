# Particle texture-unit regression

The real WebGL2 pixel test binds a red texture on unit 0, makes unit 7 active, then renders a blue particle. Before the fix it samples red; after explicit unit 0 binding all 12 particle tests pass in Chromium and Firefox. The package typecheck and targeted lint also pass.

The paired captures isolate the same binding behavior in the frozen emitter: seeded random source, reset, 120 fixed 1/60s CPU updates and pause at 120 live particles. The after images use a test-only binding override against the baseline runtime. They establish the binding cause and removal of the mosaic, not full cross-backend parity. The integrated runtime is verified separately. Discarded non-presented frame-texture hashes are intentionally absent.
