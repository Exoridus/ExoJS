# Rendering benchmark adapters

An adapter hosts one rendering library inside the same controlled harness. Its job is to represent a declared scenario faithfully, not to make every library appear to support every workload. Competitor libraries are pinned in the private benchmark competitor workspace; do not add them as public ExoJS runtime dependencies.

## Adapter boundary

Use the provided canvas, backend choice, dimensions, and deterministic scenario input. The harness owns scheduling, warm-up, measurement, and presentation of results. Do not create another requestAnimationFrame loop or resize the shared canvas independently.

Initialization prepares the renderer. Scene construction creates the requested workload. The update path applies the canonical mutations. Rendering submits that scene. Teardown releases adapter-owned state without deleting the harness's canvas or leaving a timer, observer, application ticker, or event listener alive.

Declare unsupported scenarios or backend paths explicitly. An adapter that produces a different image or simulates a smaller workload does not become comparable by returning a timing. Phaser's WebGL path must be described by the API it actually uses; a group labelled by the harness's requested backend is not proof that every library created a WebGL2 context.

## Equivalent work

Use the scenario's object count, texture set, geometry, tree shape, masks, filters, mutation selection, and visibility policy. Disable library-side culling only through a setting or path that actually controls it. An inert option with the right name is not evidence of equivalent traversal.

Use the shared deterministic mutation-selection helper and its expected signature. Do not substitute a similarly seeded random loop: a different consumption order can change which leaves update and how much work an implementation performs. Preserve the canonical ordering when it is part of the scenario.

Compare each library through its supported API. A no-op filter, flattened hierarchy, missing mask, or cheaper substitute belongs in a different scenario or an explicit exclusion. Do not add special cases after seeing which implementation wins.

## Measurements and counters

CPU-side timing covers the region defined by the harness. It does not automatically include GPU completion, presentation, or every application task. Structural probes observe draw calls and resource operations only where the underlying API is available; absent counters are unknown, not zero.

WebGPU instrumentation must attach to the device that the adapter actually uses. WebGL probes must instrument the actual context. A second device or a requested context version that the library did not adopt cannot measure the library's work.

Counters support a mechanism hypothesis. They do not prove that one counter caused a measured timing difference. Keep a causal explanation qualified unless a controlled change isolates it.

## Adding or changing an adapter

Read an existing adapter with the same backend boundary and the canonical scenario types. Implement initialization, scene construction, updates, rendering, capability exclusions, and teardown. Then test the declared image/workload invariants before recording performance.

Exercise repeated initialization and destruction, unsupported backend handling, zero or small counts, and the canonical mutation signature. Acquire complete reference runs only after the implementation is stable. The [harness methodology](../../../docs/harness.md) governs measurement and comparison; [result instructions](../../../results/README.md) govern publication and provenance.
