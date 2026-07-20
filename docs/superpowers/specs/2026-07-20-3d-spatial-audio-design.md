# 3D Spatial Audio Design

**Status:** Approved design, ready for implementation planning
**Date:** 2026-07-20
**Roadmap item:** `.workspace/roadmap/02-active-roadmap.md` — "Welle 2 Audio — 3D-Spatializer-Design-Pass"

## 1. Goal & non-goals

**Goal:** Raise ExoJS's existing point-emitter spatial audio (native `PannerNode` position + distance
attenuation, already shipped) to real 3D perceptual quality — HRTF panning, directional (cone) emitters,
and Doppler shift — while cleanly separating asset definitions from per-playback instance state.

**Non-goals (explicitly out of scope for this pass):**
- A Z/height axis. ExoJS stays a 2D engine (`Application`/`Scene`/`SceneNode` have no Z concept anywhere
  else); "3D" here means perceptual audio quality (HRTF, directionality, Doppler), not a third spatial
  dimension. Position stays `{ x, y }` with Z fixed at 0 for all Web Audio API calls, exactly as today.
- `ImpulseResponse` asset / convolution-based room acoustics ("sounds like a cathedral"). Different
  feature — room/reverb-zone modeling, not point-source emitter physics. Needs its own audio-fx package
  extension infrastructure (already flagged as non-trivial in a prior session — see
  `project-audio-fx-followups` memory). Tracked as a separate future roadmap item.
- Extending `voice.follow(node)` to accept a `View`/camera as an emitter target. A sound emitter always
  originates from a world entity; a camera is an observer abstraction, not a sound source. (The
  *listener* side already supports following a `View` — see §6 — and needs no change here.)

## 2. Current state (verified against code, 2026-07-20)

Already shipped and unaffected by this design:
- `BaseVoice` creates a native `PannerNode` per spatialized voice (`_ensurePanner()`), with
  `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` (linear/inverse/exponential, matching the
  Web Audio distance-model formulas) and 2D position (`positionX`/`positionY`, `positionZ` fixed at 0).
- `voice.follow(sceneNode)` auto-tracks a `SceneNode`'s **world** position (`getWorldTransform()` —
  correct even inside a `RetainedContainer` transform-group boundary) every frame.
- `AudioListener` tracks a `target: SceneNode | View | { x, y } | null`, auto-resolving position from
  whichever kind it is; orientation is fixed at setup time (`forward = (0,0,-1)`, `up = (0,1,0)` — a
  static 2D-into-3D convention, never updated per-frame).
- Position updates for both the listener and every spatial voice go through `SmoothedAudioParam`
  (`spatial-smoothing.ts`): epsilon-skip for stationary emitters, snap-on-teleport, ramp via
  `setTargetAtTime` otherwise — this anti-zipper-noise layer is unaffected by this design and all new
  smoothed params (see §5) reuse it.
- `panningModel` is hardcoded to `'equalpower'` in `BaseVoice._ensurePanner()` — no HRTF access.
- `AudioListener.velocity` exists as a field but is **never used** ("currently not piped to the Web Audio
  listener" per its own doc comment) — Doppler was never wired up.
- **Architectural problem this design fixes:** `distanceModel`/`refDistance`/`maxDistance`/
  `rolloffFactor`/`position` all live as mutable instance properties directly on `Sound` (the shared,
  reusable asset-definition object), not on the per-playback `Voice`. `examples/spatial-audio/
  moving-source.ts` already has to set both `sound.position` **and** `voice.position` redundantly
  (lines 92-93) to keep them in sync — direct evidence of the API's current confusion. This breaks for
  any game that plays the same `Sound` multiple times concurrently at different positions (e.g. one
  footstep sound shared by five NPCs).

## 3. API surface changes (breaking, pre-1.0 clean break — no deprecated aliases)

### 3.1 `Sound` loses all spatial/instance state

Removed entirely from `Sound`: `position`, `distanceModel`, `refDistance`, `maxDistance`,
`rolloffFactor`. `Sound` becomes a pure, stateless, freely-shareable asset definition — consistent with
how every other asset type in the engine works (`Assets.from()` definitions carry no per-play state).

A game that wants a reusable "preset" (e.g. "all footstep-type sounds use inverse falloff with
refDistance=50") authors an ordinary shared options object/factory itself and spreads it into
`PlayOptions` at each play call — not by mutating shared asset state.

### 3.2 `Voice` gains full spatial ownership

```ts
interface Voice {
  // Existing, unchanged:
  position: Vector | { x: number; y: number } | null;
  follow(node: SceneNode | null): void; // position-only — see §4 for why cone orientation does NOT hook in here

  // Moved here from Sound (same semantics, same distance-model formulas):
  distanceModel: DistanceModel;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;

  // New:
  velocity: Vector | { x: number; y: number } | null;      // §5 — explicit; auto-derived from position delta as a fallback when using follow()
  panningModel: 'equalpower' | 'HRTF' | null;                // §4 — null = inherit the app-wide default
  orientation: number;                                        // §4 — degrees, SceneNode.rotation convention (0° = local +X, clockwise-positive on a Y-down screen); only matters when a cone is configured
  coneInnerAngle: number;                                      // §4 — native PannerNode passthrough, default 360 (no cone)
  coneOuterAngle: number;                                      // §4 — default 360
  coneOuterGain: number;                                       // §4 — default 0
}
```

### 3.3 `PlayOptions` gains the same spatial fields

So a single `audio.play(sound, options)` call can fully configure a one-shot spatial emitter without a
second step:

```ts
interface PlayOptions {
  // ...existing: bus, volume, loop, playbackRate, detune, time, muted...
  position?: { x: number; y: number } | Vector;
  velocity?: { x: number; y: number } | Vector;
  distanceModel?: DistanceModel;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  panningModel?: 'equalpower' | 'HRTF';
  orientation?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
}
```

### 3.4 `AudioListener.velocity` becomes real

Same explicit-or-auto-derived-from-position-delta rule as voices (§5), symmetric on both sides of the
Doppler calculation.

### 3.5 Global defaults extend the existing shared spatial settings object

`SpatialSmoothingSettings` (`app.audio.spatial`, already shared between the listener and every spatial
voice) gains:

```ts
interface SpatialSmoothingSettings {
  // ...existing: smoothing, teleportThreshold...
  panningModel: 'equalpower' | 'HRTF';   // default 'equalpower' — see §4
  dopplerFactor: number;                  // default 0 (off) — see §5
  speedOfSound: number;                   // world-units/second reference for Doppler scaling — see §5
}
```

## 4. Panning model: `equalpower` vs `HRTF`

`equalpower` computes only a left/right (azimuth) gain split from the source-to-listener angle — cheap
(a couple of gain multiplies per render quantum), no front/back or up/down discrimination, sounds fine
on any speaker setup. `HRTF` convolves the signal against a browser-shipped, pre-measured
head-related-transfer-function dataset, producing genuine binaural directional cues — but is
meaningfully more CPU-expensive per active voice (real-time convolution vs. gain math) and only sounds
convincingly different through headphones (over regular speakers, most listeners can't tell it apart
from `equalpower`, and it can even sound slightly duller due to the frequency coloration HRTF applies).

**Decision:** `equalpower` stays the global default (`app.audio.spatial.panningModel`); `Voice.panningModel`
/`PlayOptions.panningModel` let a game opt a specific important emitter (e.g. a nearby enemy, the
player's own footsteps) into `'HRTF'` without paying the cost for every simultaneous voice (e.g. a
particle-explosion barrage).

Not modeled as a chainable `AudioEffect` — `panningModel` is a property directly on the `PannerNode`
every spatial voice already creates internally, not an insertable processing node.

### 4.1 Cone / directional emitters

The native PannerNode also exposes `coneInnerAngle`/`coneOuterAngle`/`coneOuterGain`: a uniform overall
gain reduction (identical on both ears — this does **not** change stereo panning, which stays entirely
position-driven) applied when the listener falls outside the emitter's facing direction. At the default
360°/360° angles this is a complete no-op — computed natively by the browser at effectively zero cost, so
it's exposed unconditionally on `Voice`/`PlayOptions` rather than gated behind a separate opt-in.

Cone attenuation needs a facing direction (`orientation`, in degrees), which has zero effect unless the
cone angles are narrowed from their 360° default. `orientation` uses the exact same convention as
`SceneNode.rotation` (0° = local +X / "east", clockwise-positive under the engine's Y-down screen
convention) — chosen for consistency with every other rotatable object in the engine, not tied to any
particular sprite's "facing" convention.

**`orientation` is explicit, not auto-derived from `follow(node)`.** A sprite's visual rotation does not
always semantically mean "this is the direction the sound broadcasts in" (e.g. rotation used purely for
an animation), so coupling them automatically would be a surprising, implicit link the "explicit over
implicit" engine philosophy argues against. A game that wants its emitter's cone to track a moving
sprite's facing direction sets `voice.orientation = node.rotation` itself, each frame, in its own update
logic.

A "shape-based" alternative (attach a `Circle`/`Sector` geometry primitive instead of raw angle
parameters, matching the engine's existing physics-package shape vocabulary) was considered and
rejected for this pass: it would require computing "is the listener inside this shape" in JavaScript
every frame (a real per-frame CPU cost, however small) instead of using the completely free native
`PannerNode` cone properties, for a flexibility benefit (arbitrary shapes beyond a simple cone) that has
no named use case today. Native cone angles are simpler, native, and sufficient; revisit only if a
concrete non-conical directional use case emerges.

## 5. Doppler shift

Web Audio has **no native Doppler support** — `AudioListener.dopplerFactor`/`PannerNode.dopplerFactor`
were removed from the spec years ago and no modern browser implements them. This must be computed
manually: relative velocity between source and listener, projected onto the line between them, modulates
the voice's existing `playbackRate` (composing with, not overriding, any explicit pitch/rate the game
already sets).

**Cost:** Negligible. The entire calculation (a couple of vector projections and a division) runs once
per frame per active spatial voice — not per audio sample — then writes a single new number into the
`playbackRate` `AudioParam`, which the browser's native resampler already reads every render quantum
regardless (every playing sound has a `playbackRate`; Doppler just changes what value we set it to,
it does not add a new native processing stage). This is orders of magnitude cheaper than HRTF (which is
genuine per-sample convolution) and cheaper even than `equalpower` panning.

**Not an `AudioEffect`** — same reasoning as `panningModel`: a parameter modulation, not an insertable
processing node.

**Velocity source (symmetric for both source and listener):**
1. Explicit: `voice.velocity = ...` / `listener.velocity = ...` — for a game that already tracks a
   precise velocity vector (e.g. lifted directly from a physics body).
2. Auto-derived fallback: when `follow(node)` (or `AudioListener.target`) is in use and no explicit
   velocity was set, velocity is computed each frame from the position delta
   (`(currentPosition - previousPosition) / deltaTime`) — mirroring the existing explicit-position-vs-
   `follow()` duality, so games with no dedicated velocity tracking (position-only sprites) still get a
   working Doppler effect for free.

**Opt-in via `dopplerFactor` (default `0`, off):** even when velocity data exists, no Doppler is applied
unless `app.audio.spatial.dopplerFactor` (or wherever the final tunable lands) is set above zero. This
avoids a surprising, always-on pitch shift for any game that tracks velocity for unrelated reasons (pure
physics, no audio intent) — consistent with the engine's "explicit over implicit" default and with the
`panningModel`/cone defaults above (all new spatial behavior in this pass ships opt-in or as a genuine
free no-op, never a surprising default-on behavior change). `speedOfSound` is a separate, configurable
reference speed (in world units/second, not real-world meters/second, since a "world unit" has no fixed
physical scale across different games) used to scale the effect's perceptual strength; `dopplerFactor`
is the exaggeration multiplier on top of that, matching the common game-audio convention (many games,
e.g. racing games, deliberately exaggerate Doppler beyond physical accuracy for player feedback).

## 6. Listener/camera interaction (no new work needed)

`AudioListener.target` already accepts a `View` (camera) in addition to a `SceneNode` — reading
`view.center` for position. This is unaffected by this design and benefits automatically from §5's
velocity work: a panning/scrolling camera's frame-to-frame movement will auto-derive a listener velocity
exactly like a followed `SceneNode` would, producing a correct Doppler effect from camera motion alone
with no additional code. Nothing new needs designing here.

Extending `voice.follow()` to accept a `View` for **emitters** was considered and explicitly rejected
(see §1 non-goals) — a sound source is a world entity, never "the camera" itself.

## 7. Migration impact

All three existing `examples/spatial-audio/*.ts` examples (`falloff-curves.ts`, `listener-and-source.ts`,
`moving-source.ts`) currently set `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` in the
`Sound` constructor and `sound.position = ...` directly — all three need updating to the new
`Voice`/`PlayOptions`-only API. `moving-source.ts` in particular currently sets both `sound.position`
**and** `voice.position` redundantly (the exact confusion this design eliminates) and will collapse to
setting only `voice.position`. Any guide prose referencing the old `Sound.position` API needs the same
update.

## 8. Testing approach

Follows the existing audio-fx test pattern established across the prior Stufe 1–3 sessions
(`project-audio-fx-followups` memory):
- **Type tests** for the new `PlayOptions`/`Voice` fields (optional, correct types, `panningModel` union
  narrowing).
- **jsdom tests** for pure wiring: correct `PannerNode` property assignment, velocity auto-derivation from
  position deltas (both voice and listener), cone angle/orientation passthrough, `dopplerFactor === 0`
  short-circuiting the Doppler calculation entirely (no `playbackRate` mutation when off).
- **Real browser-audio tests** (Playwright + `OfflineAudioContext`, reusing the existing
  `browser-audio-chromium` vitest project and its FFT-based harness) for Doppler: render a moving source
  past a stationary listener and verify a measurable frequency shift, matching the same acoustic-proof
  rigor used for the existing `PitchShift` effect's SOLA verification.
- `HRTF` itself needs no new acoustic test — it's a native browser feature; testing only verifies
  `panningModel` is correctly set on the `PannerNode` (wiring, not acoustics).

## 9. Summary of decisions

| Question | Decision |
|---|---|
| Z/height axis | No — stays 2D X/Y, "3D" = perceptual quality only |
| HRTF default | `equalpower` global default, `HRTF` opt-in per-voice/per-play override |
| Sound.position/distanceModel/etc. | Removed entirely from `Sound`; moved fully to `Voice`/`PlayOptions` (breaking) |
| Doppler | In scope; velocity explicit-or-auto-derived (both source and listener); `dopplerFactor` default `0` (off); negligible cost, not an `AudioEffect` |
| Cone/directional emitters | Native `coneInnerAngle`/`coneOuterAngle`/`coneOuterGain` + `orientation` (degrees, `SceneNode.rotation` convention); explicit, not auto-synced with `follow()`; shape-based alternative rejected (no named use case, real per-frame JS cost vs. free native cone) |
| `ImpulseResponse` / room acoustics | Out of scope — separate future feature |
| Listener following a `View`/camera | Already works today, unaffected; benefits automatically from Doppler velocity work |
| Emitter following a `View`/camera | Rejected — no use case, wrong semantic role for a sound source |
