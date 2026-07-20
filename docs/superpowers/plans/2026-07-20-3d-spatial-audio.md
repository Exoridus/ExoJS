# 3D Spatial Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved design in `docs/superpowers/specs/2026-07-20-3d-spatial-audio-design.md` — move spatial descriptor state off `Sound` onto the per-playback `Voice`/`PlayOptions`, then add HRTF panning (opt-in), directional cone emitters, and Doppler shift on top.

**Architecture:** `BaseVoice` (the shared base for `SoundVoice`/`AudioStreamVoice`/`AudioGeneratorVoice`) becomes the sole owner of spatial configuration — position, velocity, distance model, panning model, cone/orientation — configurable either at construction via `PlayOptions` or live via public setters. `Sound` becomes a stateless asset descriptor. `AudioManager.spatial` (today's `SpatialSmoothingSettings`) gains the app-wide defaults (`panningModel`, `dopplerFactor`, `speedOfSound`) that per-voice settings can override.

**Tech Stack:** TypeScript, Vitest (jsdom project — `#audio` alias), native Web Audio API (`PannerNode`, `AudioListener`).

## Global Constraints

- Pre-1.0 breaking changes are clean breaks — no deprecated aliases, no compat shims. `Sound.position`/`velocity`/`distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` are removed entirely, not kept as deprecated wrappers.
- Z stays fixed at `0` everywhere a Web Audio 3D API expects it (`positionZ`, `orientationZ`) — no Z/height axis (design spec §1 non-goal).
- `panningModel`/`orientation`/`coneInnerAngle`/`coneOuterAngle`/`coneOuterGain`/`velocity`/`dopplerFactor` are NOT `AudioEffect`s — they are properties/parameters on the voice's existing `PannerNode`/source node, never inserted as chainable processing nodes (design spec §4, §5).
- `dopplerFactor` defaults to `0` (off) on `SpatialSmoothingSettings` — Doppler must never apply unless a game explicitly opts in, even when velocity data is available (design spec §5).
- Cone `orientation` is explicit and never auto-derived from `voice.follow(node)`'s tracked `SceneNode`'s rotation — a game that wants them synced sets `voice.orientation = node.rotation` itself each frame (design spec §4.1).
- `orientation`'s degrees convention matches `SceneNode.rotation` exactly: 0° = local +X ("east"), clockwise-positive under the engine's Y-down screen convention (design spec §4.1) — do not invent a different zero-point.
- Velocity (for Doppler) is explicit-or-auto-derived from position deltas, symmetric for both `Voice` and `AudioListener` (design spec §5) — never auto-derived on one side only.
- No `ImpulseResponse` asset / room-acoustics work, no `View`/camera support on `voice.follow()` (design spec §1 non-goals) — do not add either while implementing this plan.
- Existing anti-zipper-noise smoothing (`SmoothedAudioParam`, epsilon-skip + teleport-snap + ramp) must be reused for every new per-frame `AudioParam` write (new orientation params) — never a raw `setValueAtTime` every frame.

---

## Task 1: Move spatial descriptor ownership from `Sound` to `Voice`/`PlayOptions`

**Files:**
- Modify: `src/audio/Sound.ts`
- Modify: `src/audio/Playable.ts`
- Modify: `src/audio/BaseVoice.ts`
- Modify: `src/audio/AudioStream.ts`
- Modify: `src/audio/AudioGenerator.ts`
- Create: `src/audio/spatial-options.ts`
- Rename + rewrite: `test/audio/sound-spatial.test.ts` → `test/audio/voice-spatial.test.ts`

**Interfaces:**
- Produces: `Spatializable` gains `distanceModel: DistanceModel`, `refDistance: number`, `maxDistance: number`, `rolloffFactor: number` (get/set pairs, alongside the existing `position`/`follow`). `PlayOptions` gains `position?: { x: number; y: number } | Vector`, `distanceModel?: DistanceModel`, `refDistance?: number`, `maxDistance?: number`, `rolloffFactor?: number`. `DistanceModel` type moves from `Sound.ts` to `Playable.ts` (still exported from the package root under the same name). `seedVoiceFromPlayOptions(voice: Spatializable, options: PlayOptions): void` — a shared helper in the new `src/audio/spatial-options.ts`, applying every spatial `PlayOptions` field present on `options` to `voice` via its live public setters. Every `Playable._createVoice` implementation (`Sound`, `AudioStream`, `AudioGenerator`) calls it exactly once, right after constructing its voice, instead of hand-building spatial config or duplicating per-field seeding logic at each call site.
- Consumed by: Task 3 (`panningModel`), Task 4 (`orientation`/cone), Task 5 (`velocity`) each add exactly one new field-check line to `seedVoiceFromPlayOptions` — they do NOT need to touch `Sound.ts`/`AudioStream.ts`/`AudioGenerator.ts` again, since those files' `_createVoice` implementations already call the shared helper unconditionally.

- [ ] **Step 1: Move the `DistanceModel` type to `Playable.ts`**

Cut this block out of `src/audio/Sound.ts` (currently lines 51-62):

```ts
/**
 * Distance-attenuation model used by spatial sounds.
 *
 * Mirrors Web Audio's `PannerNode.distanceModel`:
 * - `'linear'` — `v = 1 - rolloffFactor * (d - refDistance) / (maxDistance - refDistance)`,
 *   clamped to [0, 1]. Reaches silence at `maxDistance`.
 * - `'inverse'` — `v = refDistance / (refDistance + rolloffFactor * (d - refDistance))`.
 *   Physically realistic; never reaches absolute silence.
 * - `'exponential'` — `v = (d / refDistance) ^ -rolloffFactor`. Steepest near
 *   the listener; useful for very intimate sources.
 */
export type DistanceModel = 'linear' | 'inverse' | 'exponential';
```

Paste it into `src/audio/Playable.ts`, placed just above the `Spatializable` interface (before line 88's `/** A voice that can be positioned in 2D space and optionally track a node. */`).

- [ ] **Step 2: Extend `Spatializable` and `PlayOptions` in `Playable.ts`**

Replace the current `Spatializable` interface (lines 88-100) with:

```ts
/** A voice that can be positioned in 2D space and optionally track a node. */
export interface Spatializable {
  /** World-space position of the source, or `null` when not spatialized. */
  get position(): Vector | null;
  /** Accepts any `{ x, y }` point — implementations copy the values. */
  set position(value: Vector | { x: number; y: number } | null);
  /**
   * Track a {@link SceneNode}: the voice reads the node's global translation
   * each frame. Pass `null` to stop following and fall back to
   * {@link Spatializable.position}.
   */
  follow(node: SceneNode | null): void;
  /** Distance-attenuation model. Default `'linear'`. */
  distanceModel: DistanceModel;
  /** Distance below which volume is at full strength. Default `50`. */
  refDistance: number;
  /** For the `'linear'` model: distance at which volume reaches zero. Default `1000`. */
  maxDistance: number;
  /** Falloff rate. Higher = steeper attenuation. Default `1`. */
  rolloffFactor: number;
}
```

Replace the current `PlayOptions` interface (lines 105-120) with:

```ts
/**
 * Per-play overrides passed to {@link AudioManager.play}.
 */
export interface PlayOptions {
  /** Route this play through a specific {@link AudioBus}. */
  bus?: AudioBus;
  /** Override volume for this play instance. Range [0, 1]. */
  volume?: number;
  /** Override looping for this play instance. */
  loop?: boolean;
  /** Override playback rate for this play instance. */
  playbackRate?: number;
  /** Override pitch detune (cents) for this play instance. */
  detune?: number;
  /** Seek offset in seconds before starting playback. */
  time?: number;
  /** Start muted (volume 0). */
  muted?: boolean;
  /** Initial spatial position — equivalent to setting `voice.position` right after play. */
  position?: { x: number; y: number } | Vector;
  /** Initial distance-attenuation model. Default `'linear'`. */
  distanceModel?: DistanceModel;
  /** Initial reference distance. Default `50`. */
  refDistance?: number;
  /** Initial max distance (`'linear'` model only). Default `1000`. */
  maxDistance?: number;
  /** Initial rolloff factor. Default `1`. */
  rolloffFactor?: number;
}
```

- [ ] **Step 3: Give `BaseVoice` live, public `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` accessors**

In `src/audio/BaseVoice.ts`, the existing `_spatialConfig: VoiceSpatialConfig` (line 78) already holds these four values but only as a one-time constructor snapshot with no live public accessors. Add four getter/setter pairs directly below the existing `follow()` method (after line 247, before the `_tickSpatial` block that starts at line 249):

```ts
  public get distanceModel(): DistanceModel {
    return this._spatialConfig.distanceModel;
  }

  public set distanceModel(value: DistanceModel) {
    this._spatialConfig.distanceModel = value;
    if (this._panner !== null) {
      this._panner.distanceModel = value;
    }
  }

  public get refDistance(): number {
    return this._spatialConfig.refDistance;
  }

  public set refDistance(value: number) {
    const clamped = Math.max(0, value);
    this._spatialConfig.refDistance = clamped;
    if (this._panner !== null) {
      this._panner.refDistance = clamped;
    }
  }

  public get maxDistance(): number {
    return this._spatialConfig.maxDistance;
  }

  public set maxDistance(value: number) {
    const clamped = Math.max(0, value);
    this._spatialConfig.maxDistance = clamped;
    if (this._panner !== null) {
      this._panner.maxDistance = clamped;
    }
  }

  public get rolloffFactor(): number {
    return this._spatialConfig.rolloffFactor;
  }

  public set rolloffFactor(value: number) {
    const clamped = Math.max(0, value);
    this._spatialConfig.rolloffFactor = clamped;
    if (this._panner !== null) {
      this._panner.rolloffFactor = clamped;
    }
  }
```

`_spatialConfig` is declared `private readonly` (line 78) but its VALUE (the object) is mutable — only the binding is `readonly`, so `this._spatialConfig.distanceModel = value` is valid. Import `DistanceModel` into `BaseVoice.ts`:

```ts
import type { Spatializable, Voice } from './Playable';
```

becomes:

```ts
import type { DistanceModel, Spatializable, Voice } from './Playable';
```

Also update the file-local `VoiceSpatialConfig` interface (lines 13-18) to use the imported `DistanceModel` instead of its own inline `DistanceModelType` (the native `lib.dom.d.ts` enum, which happens to have the same three string values but is the wrong type to reference — `DistanceModel` is the engine's own public type):

```ts
export interface VoiceSpatialConfig {
  distanceModel: DistanceModel;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}
```

- [ ] **Step 4: Remove all spatial descriptor state from `Sound.ts`**

Remove the `Vector` import (line 4) — it becomes unused once `_position`/`_velocity` are gone (verify no other use of `Vector` remains in the file before deleting the import; per the current file there is none).

Remove from `SoundOptions` (lines 65-86): the `distanceModel?`, `refDistance?`, `maxDistance?`, `rolloffFactor?` fields and their doc comments (lines 78-85), leaving:

```ts
/** Construction options for {@link Sound}. */
export interface SoundOptions {
  poolSize?: number;
  poolStrategy?: SoundPoolStrategy;
  priority?: number;
  sprites?: Readonly<Record<string, AudioSpriteClip>>;
  /** Default volume for voices created from this sound. Range [0, 1]. Default: 1. */
  volume?: number;
  /** Default loop setting. Default: false. */
  loop?: boolean;
  /** Default playback rate. Default: 1. */
  playbackRate?: number;
  /** Default muted state. Default: false. */
  muted?: boolean;
}
```

Remove the spatial descriptor fields (lines 148-153):

```ts
  // Spatial descriptor params — read by _createVoice to configure the PannerNode.
  private _position: Vector | null = null;
  private _velocity: Vector | null = null;
  private _distanceModel: DistanceModel = 'linear';
  private _refDistance = 50;
  private _maxDistance = 1000;
  private _rolloffFactor = 1;
```

Remove the `position`/`velocity`/`distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` getters and setters entirely (lines 240-312 — everything between the `priority` setter and the constructor).

In the constructor (lines 314-345), remove `distanceModel`, `refDistance`, `maxDistance`, `rolloffFactor` from the destructured `options` (line 318) and remove their four `if (... !== undefined)` blocks (lines 329-340):

```ts
  public constructor(audioBuffer: AudioBuffer | null = null, options: SoundOptions = {}) {
    this._audioBuffer = audioBuffer;
    this._clipEnd = audioBuffer?.duration ?? 0;

    const { poolSize, poolStrategy, priority, sprites, volume, loop, playbackRate, muted } = options;

    this.volume = clamp(volume ?? 1, 0, 1);
    this.loop = loop ?? false;
    this.playbackRate = clamp(playbackRate ?? 1, 0.1, 20);
    this.muted = muted ?? false;

    this._poolSize = Math.max(1, Math.floor(poolSize ?? 8));
    this._poolStrategy = poolStrategy ?? SoundPoolStrategy.FirstInFirstOut;
    this._priority = priority ?? 0;

    if (sprites) {
      this.setSprites(sprites);
    }
  }
```

In `clip()` (lines 416-441), remove the four spatial fields from the nested `new Sound(...)` options object:

```ts
  public clip(offset: number, duration: number): Sound {
    if (this._audioBuffer === null) {
      throw new Error('Sound.clip() is unavailable: the sound is not loaded yet.');
    }

    const start = clamp(offset, 0, this._audioBuffer.duration);
    const end = clamp(start + duration, start, this._audioBuffer.duration);

    const clip = new Sound(this._audioBuffer, {
      volume: this.volume,
      loop: this.loop,
      playbackRate: this.playbackRate,
      muted: this.muted,
      poolSize: this._poolSize,
      poolStrategy: this._poolStrategy,
      priority: this._priority,
    });
    clip._clipStart = start;
    clip._clipEnd = end;

    return clip;
  }
```

In `_buildVoice()` (lines 558-629), remove the `spatial: {...}` block (lines 595-600) entirely from the `new SoundVoice({...})` call — the voice is now always constructed with its default spatial config, seeded afterward via the shared helper (Step 4a below):

```ts
    const voice = new SoundVoice({
      audioContext,
      output,
      bus,
      manager,
      volume,
      buffer,
      loop,
      playbackRate,
      detune,
      offset,
      window,
    });

    seedVoiceFromPlayOptions(voice, options);
```

replacing the old position-seeding block (lines 609-613: `if (this._position !== null) { voice.position = this._position; }`) — that block referenced the descriptor's own `_position`, which no longer exists after this step.

Add the import:

```ts
import { seedVoiceFromPlayOptions } from './spatial-options';
```

Remove the `position`/`velocity` cleanup from `destroy()` (lines 640-653), leaving:

```ts
  public destroy(): void {
    this._stopAllVoices();
    this._sprites.clear();
  }
```

- [ ] **Step 4a: Create the shared `seedVoiceFromPlayOptions` helper**

Create `src/audio/spatial-options.ts`:

```ts
import type { PlayOptions, Spatializable } from './Playable';

/**
 * Apply every spatial {@link PlayOptions} field present on `options` to
 * `voice`, via its live public setters — so a single `audio.play(sound,
 * options)` call can fully configure a spatial emitter without a second
 * step. Shared by every {@link Playable._createVoice} implementation
 * (`Sound`, `AudioStream`, `AudioGenerator`) so a new spatial option only
 * needs adding here once, not at every call site.
 */
export function seedVoiceFromPlayOptions(voice: Spatializable, options: PlayOptions): void {
  if (options.distanceModel !== undefined) voice.distanceModel = options.distanceModel;
  if (options.refDistance !== undefined) voice.refDistance = options.refDistance;
  if (options.maxDistance !== undefined) voice.maxDistance = options.maxDistance;
  if (options.rolloffFactor !== undefined) voice.rolloffFactor = options.rolloffFactor;
  if (options.position !== undefined) voice.position = options.position;
}
```

(Distance-model fields are applied before `position` — though every field's own setter already independently handles "no panner yet" by caching onto `_spatialConfig`/its own private field, so this ordering is not required for correctness, only for readability: "configure how it attenuates, then place it".)

- [ ] **Step 5: Call the shared helper from `AudioStream` and `AudioGenerator`**

Neither `_createVoice` currently passes any spatial config (both omit the old `spatial` constructor field entirely) — add a single call to the new shared helper right after constructing the voice, exactly like Step 4's `Sound._buildVoice` change.

In `src/audio/AudioStream.ts`'s `_createVoice` (around line 90), after the `new AudioStreamVoice({...})` call:

```ts
    seedVoiceFromPlayOptions(voice, options);
```

Add the import `import { seedVoiceFromPlayOptions } from './spatial-options';` to `AudioStream.ts`.

Apply the identical one-line addition to `src/audio/AudioGenerator.ts`'s `_createVoice` (around line 154), right after the `new AudioGeneratorVoice({...})` call, with the same import added.

- [ ] **Step 6: Rewrite the spatial test file for the `Voice`-owned API**

```bash
git mv test/audio/sound-spatial.test.ts test/audio/voice-spatial.test.ts
```

Replace the entire content of `test/audio/voice-spatial.test.ts` with:

```ts
import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';
import { Drawable } from '#rendering/Drawable';
import { RetainedContainer } from '#rendering/RetainedContainer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (): AudioBuffer =>
  ({
    duration: 2,
  }) as AudioBuffer;

interface MockPannerNode {
  connect: MockInstance;
  disconnect: MockInstance;
  context: AudioContext;
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  maxDistance: number;
  refDistance: number;
  rolloffFactor: number;
  positionX: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
  positionY: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
  positionZ: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
}

const setupPannerSpy = (): {
  panners: MockPannerNode[];
  restore: () => void;
} => {
  const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
  const panners: MockPannerNode[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const panner: MockPannerNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      context: ctx,
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      positionX: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      positionY: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      positionZ: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    };
    panners.push(panner);
    return panner as unknown as PannerNode;
  });
  return { panners, restore: () => spy.mockRestore() };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Voice — spatial (PannerNode)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a plain play() with no spatial options creates no PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    expect(spy.panners.length).toBe(0);
    expect(voice.position).toBeNull();
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions.position creates a PannerNode with correct default spatial parameters', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 10, y: 20 } });
    expect(spy.panners.length).toBe(1);
    expect(voice.position!.x).toBe(10);
    expect(voice.position!.y).toBe(20);
    const panner = spy.panners[0];
    expect(panner.panningModel).toBe('equalpower');
    expect(panner.distanceModel).toBe('linear');
    expect(panner.maxDistance).toBe(1000);
    expect(panner.refDistance).toBe(50);
    expect(panner.rolloffFactor).toBe(1);
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions.distanceModel/refDistance/maxDistance/rolloffFactor configure the PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, {
      position: { x: 0, y: 0 },
      distanceModel: 'exponential',
      refDistance: 20,
      maxDistance: 500,
      rolloffFactor: 2,
    });
    const panner = spy.panners[0];
    expect(panner.distanceModel).toBe('exponential');
    expect(panner.refDistance).toBe(20);
    expect(panner.maxDistance).toBe(500);
    expect(panner.rolloffFactor).toBe(2);
    spy.restore();
    sound.destroy();
  });

  test('setting voice.position after play creates a PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    expect(spy.panners.length).toBe(0);
    voice.position = { x: 5, y: 6 };
    expect(spy.panners.length).toBe(1);
    spy.restore();
    sound.destroy();
  });

  test('voice is registered as spatial in the mixer when created with a position', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.update();
    expect(tickSpy).toHaveBeenCalledTimes(1);
    spy.restore();
    sound.destroy();
  });

  test('update() writes voice position x/y to PannerNode, then skips a stationary source', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    mixer.play(sound, { position: { x: 55, y: 66 } });
    const panner = spy.panners[0];

    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(55, expect.any(Number));
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(66, expect.any(Number));
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    panner.positionX.setValueAtTime.mockClear();
    panner.positionX.setTargetAtTime.mockClear();
    mixer.update();
    expect(panner.positionX.setValueAtTime).not.toHaveBeenCalled();
    expect(panner.positionX.setTargetAtTime).not.toHaveBeenCalled();

    spy.restore();
    sound.destroy();
  });

  test('setting voice.position to null clears it and stops further panner writes', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 1, y: 2 } });
    voice.position = null;
    expect(voice.position).toBeNull();
    spy.restore();
    sound.destroy();
  });

  test('two plays of the same Sound each get an independent Voice and PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voiceA = manager.play(sound, { position: { x: 0, y: 0 } });
    const voiceB = manager.play(sound, { position: { x: 100, y: 0 } });
    expect(spy.panners.length).toBe(2);
    expect(voiceA.position!.x).toBe(0);
    expect(voiceB.position!.x).toBe(100);
    spy.restore();
    sound.destroy();
  });

  test('voice.stop() disconnects the PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });
    const panner = spy.panners[0];

    voice.stop();
    expect(panner.disconnect).toHaveBeenCalled();
    spy.restore();
    sound.destroy();
  });

  test('ended voice is removed from spatial tracking after update()', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;

    voice.stop();

    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();

    spy.restore();
    sound.destroy();
  });

  // AU1: voice.follow must track WORLD positions, not group-local ones.
  test('voice.follow of a node inside a translated RetainedContainer writes the WORLD position to the panner', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    const group = new RetainedContainer();
    const emitter = new Drawable();

    group.setPosition(300, 400);
    emitter.setPosition(5, 6);
    group.addChild(emitter);

    voice.follow(emitter);

    const panner = spy.panners[0];

    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(305, expect.any(Number));
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(406, expect.any(Number));

    group.setPosition(-100, 0);
    panner.positionX.setTargetAtTime.mockClear();
    panner.positionY.setTargetAtTime.mockClear();

    voice._tickSpatial();

    expect(panner.positionX.setTargetAtTime).toHaveBeenCalledWith(-95, expect.any(Number), expect.any(Number));
    expect(panner.positionY.setTargetAtTime).toHaveBeenCalledWith(6, expect.any(Number), expect.any(Number));

    spy.restore();
    group.destroy();
    sound.destroy();
  });

  test('voice.distanceModel/refDistance/maxDistance/rolloffFactor round-trip and clamp to >= 0', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    expect(voice.distanceModel).toBe('linear');
    voice.distanceModel = 'exponential';
    expect(voice.distanceModel).toBe('exponential');

    expect(voice.refDistance).toBe(50);
    voice.refDistance = 20;
    expect(voice.refDistance).toBe(20);
    voice.refDistance = -5;
    expect(voice.refDistance).toBe(0);

    expect(voice.maxDistance).toBe(1000);
    voice.maxDistance = 500;
    expect(voice.maxDistance).toBe(500);
    voice.maxDistance = -1;
    expect(voice.maxDistance).toBe(0);

    expect(voice.rolloffFactor).toBe(1);
    voice.rolloffFactor = 2.5;
    expect(voice.rolloffFactor).toBe(2.5);
    voice.rolloffFactor = -3;
    expect(voice.rolloffFactor).toBe(0);

    sound.destroy();
  });

  test('changing distanceModel/refDistance/maxDistance/rolloffFactor after the panner exists writes through live', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });
    const panner = spy.panners[0];

    voice.distanceModel = 'inverse';
    voice.refDistance = 10;
    voice.maxDistance = 200;
    voice.rolloffFactor = 3;

    expect(panner.distanceModel).toBe('inverse');
    expect(panner.refDistance).toBe(10);
    expect(panner.maxDistance).toBe(200);
    expect(panner.rolloffFactor).toBe(3);

    spy.restore();
    sound.destroy();
  });

  test('destroy() stops all active voices', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } });

    sound.destroy();

    expect(voice.ended).toBe(true);

    const tickSpy = vi.spyOn(voice as SoundVoice, '_tickSpatial');
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();

    spy.restore();
  });
});
```

- [ ] **Step 7: Run the affected test file, typecheck**

```bash
pnpm vitest run test/audio/voice-spatial.test.ts
```

Expected: PASS (all tests above).

```bash
pnpm typecheck
```

Expected: no errors. This will surface every remaining call site still assuming `Sound.position`/`distanceModel`/etc. exist — fix any the plan's Task 2 doesn't already cover (there should be none outside `examples/` and `site/`, both handled in Task 2).

- [ ] **Step 8: Run the full `test/audio` directory**

```bash
pnpm vitest run test/audio
```

Expected: all pass — this catches any other test file (e.g. `sound.test.ts`, `sound-clip.test.ts`) that may have incidentally exercised the removed `Sound` fields.

- [ ] **Step 9: Commit**

```bash
git add src/audio/Sound.ts src/audio/Playable.ts src/audio/BaseVoice.ts src/audio/AudioStream.ts src/audio/AudioGenerator.ts \
        src/audio/spatial-options.ts test/audio/voice-spatial.test.ts
git status --short  # confirm sound-spatial.test.ts shows as deleted/renamed, voice-spatial.test.ts as added, spatial-options.ts as new
git commit -m "$(cat <<'EOF'
refactor(audio)!: move spatial descriptor state from Sound to Voice/PlayOptions

Sound becomes a stateless asset descriptor; position, velocity,
distanceModel, refDistance, maxDistance, and rolloffFactor now live
entirely on the per-playback Voice (settable live, or seeded via
PlayOptions at play() time). Fixes the redundant sound.position +
voice.position duplication visible in examples/spatial-audio/moving-source.ts.
EOF
)"
```

---

## Task 2: Migrate examples and the spatial-audio guide for Task 1's breaking change

**Files:**
- Modify: `examples/spatial-audio/falloff-curves.ts`, `examples/spatial-audio/listener-and-source.ts`, `examples/spatial-audio/moving-source.ts` (and their auto-generated `.js` twins, regenerated — not hand-edited)
- Modify: `site/src/content/guide/audio/spatial-audio.mdx`

**Interfaces:**
- Consumes: `PlayOptions.position`/`distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` and `Voice.distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` from Task 1.

- [ ] **Step 1: Migrate `falloff-curves.ts`**

Read the current file at `examples/spatial-audio/falloff-curves.ts` first (its content is already known from earlier investigation but re-read before editing to catch any drift). Replace the `Sound` construction + play block:

```ts
        this.sounds = this.sources.map(({ model, x, y }) => {
            const sound = new Sound(source.audioBuffer, {
                distanceModel: model,
                refDistance: REF_DISTANCE,
                maxDistance: MAX_DISTANCE,
                rolloffFactor: ROLLOFF,
            });
            sound.position = { x, y };
            return sound;
        });
```

becomes:

```ts
        this.sounds = this.sources.map(() => new Sound(source.audioBuffer));
```

and the play loop:

```ts
        for (const sound of this.sounds) app.audio.play(sound, { loop: true, volume: 0.5 });
```

becomes:

```ts
        for (let i = 0; i < this.sounds.length; i++) {
            const { model, x, y } = this.sources[i];
            app.audio.play(this.sounds[i], {
                loop: true,
                volume: 0.5,
                position: { x, y },
                distanceModel: model,
                refDistance: REF_DISTANCE,
                maxDistance: MAX_DISTANCE,
                rolloffFactor: ROLLOFF,
            });
        }
```

- [ ] **Step 2: Migrate `listener-and-source.ts`**

Read the current file first. Find the `Sound` constructor call passing `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor`, and the `this.sound.position = { x: width / 2 + 220, y: height / 2 };` line (currently line 60) plus the later `this.sound.position = { x: pointer.x, y: pointer.y };` (currently line 92, alongside `this.voice.position = { x: pointer.x, y: pointer.y };` at line 93 — this is the exact redundant-duplication case).

Move the `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` options and the initial position out of the `Sound` constructor and into the `app.audio.play(sound, {...})` call that creates `this.voice`; delete the `Sound`-level `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` options entirely; delete the now-redundant `this.sound.position = ...` line at line 92, keeping only `this.voice.position = { x: pointer.x, y: pointer.y };`.

- [ ] **Step 3: Migrate `moving-source.ts`**

Read the current file first. Same pattern: `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` move from the `Sound` constructor into the `app.audio.play(sound, {...})` call; the two `this.sound.position = ...` lines (currently lines 58 and 93, both paired with a redundant `this.voice.position = ...` right next to them) are deleted, keeping only the `voice.position` assignments.

- [ ] **Step 4: Regenerate the `.js` twins**

```bash
pnpm --filter @codexo/exojs-examples examples:sync
```

Expected: `falloff-curves.js`, `listener-and-source.js`, `moving-source.js` regenerated to match the `.ts` edits.

- [ ] **Step 5: Typecheck examples**

```bash
pnpm typecheck:examples
```

Expected: no errors.

- [ ] **Step 6: Update `spatial-audio.mdx`**

Read `site/src/content/guide/audio/spatial-audio.mdx` in full first. Update every code sample that currently reads `sound.distanceModel = 'inverse';` / `sound.refDistance = 80;` / `sound.rolloffFactor = 2;` (around lines 98-100) and `waterfall.distanceModel = 'inverse';` / `waterfall.refDistance = 300;` (around lines 133-134) to the `Voice`-owned equivalents (e.g. rename the local variable from a `Sound` instance to a `Voice` instance where the sample was mutating post-construction state, or fold the values into the `app.audio.play(sound, {...})` call where the sample plays once). Update the prose immediately preceding those samples (and the closing paragraph around line 141, "assign a position (on the descriptor before play, or on the live voice after)") to reflect that position/distance-model configuration now happens only via `PlayOptions` at play time or live on the returned `Voice` — never on the `Sound` descriptor itself.

- [ ] **Step 7: Typecheck guides**

```bash
pnpm typecheck:guides
```

Expected: no errors — this extracts and typechecks the guide's code blocks, catching any remaining `Sound`-level spatial API usage.

- [ ] **Step 8: Commit**

```bash
git add examples/spatial-audio site/src/content/guide/audio/spatial-audio.mdx
git commit -m "$(cat <<'EOF'
docs(audio): migrate spatial-audio examples and guide to the Voice-owned spatial API
EOF
)"
```

---

## Task 3: Panning model — `equalpower` default, `HRTF` opt-in

**Files:**
- Modify: `src/audio/spatial-smoothing.ts`
- Modify: `src/audio/BaseVoice.ts`
- Modify: `src/audio/Playable.ts`
- Modify: `src/audio/spatial-options.ts` (one line added to `seedVoiceFromPlayOptions`)
- Test: `test/audio/voice-spatial.test.ts` (append), `test/audio/spatial-smoothing.test.ts` (append)

**Interfaces:**
- Consumes: `SpatialSmoothingSettings` (Task 1's `Spatializable`/`PlayOptions` extension pattern), `seedVoiceFromPlayOptions` (Task 1).
- Produces: `SpatialSmoothingSettings.panningModel: 'equalpower' | 'HRTF'` (default `'equalpower'`). `Spatializable.panningModel: 'equalpower' | 'HRTF' | null` (`null` = inherit the app-wide default). `PlayOptions.panningModel?: 'equalpower' | 'HRTF'`.

- [ ] **Step 1: Extend `SpatialSmoothingSettings`**

In `src/audio/spatial-smoothing.ts`, add to the interface (after `teleportThreshold`):

```ts
  /**
   * App-wide default panning model for every spatial voice that doesn't set
   * its own {@link Spatializable.panningModel} override. `'equalpower'`
   * (cheap, works on any speaker setup) or `'HRTF'` (binaural, meaningfully
   * more CPU-expensive per voice, only sounds convincingly directional
   * through headphones). Default `'equalpower'`.
   */
  panningModel: PanningModelType;
```

and to `createSpatialSmoothingSettings()`:

```ts
export const createSpatialSmoothingSettings = (): SpatialSmoothingSettings => ({
  smoothing: DEFAULT_SPATIAL_SMOOTHING,
  teleportThreshold: DEFAULT_TELEPORT_THRESHOLD,
  panningModel: 'equalpower',
});
```

`PanningModelType` is a built-in `lib.dom.d.ts` type (`'equalpower' | 'HRTF'`) — no import needed, it's globally available exactly like `DistanceModelType` already is elsewhere in this file's sibling files.

- [ ] **Step 2: Add `panningModel` to `Spatializable` and `PlayOptions`**

In `src/audio/Playable.ts`, add to `Spatializable` (after `rolloffFactor`):

```ts
  /**
   * Per-voice panning model override. `null` (default) inherits the
   * app-wide default from `app.audio.spatial.panningModel`.
   */
  panningModel: PanningModelType | null;
```

and to `PlayOptions` (after `rolloffFactor?`):

```ts
  /** Per-play panning model override. Omit to inherit the app-wide default. */
  panningModel?: PanningModelType;
```

- [ ] **Step 3: Wire it into `BaseVoice`**

In `src/audio/BaseVoice.ts`, add a private field alongside the existing spatial state (near `_position`):

```ts
  private _panningModel: PanningModelType | null = null;
```

Add the getter/setter (grouped with the other new accessors from Task 1 Step 3):

```ts
  public get panningModel(): PanningModelType | null {
    return this._panningModel;
  }

  public set panningModel(value: PanningModelType | null) {
    this._panningModel = value;
    if (this._panner !== null) {
      this._panner.panningModel = value ?? this._manager.spatial.panningModel;
    }
  }
```

In `_ensurePanner()` (currently line 360, `panner.panningModel = 'equalpower';` hardcoded), replace with:

```ts
    panner.panningModel = this._panningModel ?? this._manager.spatial.panningModel;
```

Add `panningModel` handling to the shared helper: in `src/audio/spatial-options.ts`, add one line to `seedVoiceFromPlayOptions` (after the `position` line):

```ts
  if (options.panningModel !== undefined) voice.panningModel = options.panningModel;
```

This is the ONLY change needed to propagate `panningModel` through every `Playable` type's `_createVoice` — `Sound.ts`/`AudioStream.ts`/`AudioGenerator.ts` are not touched again.

- [ ] **Step 4: Tests**

Append to `test/audio/voice-spatial.test.ts`:

```ts
  test('panningModel defaults to the app-wide equalpower setting', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 } });
    expect(spy.panners[0].panningModel).toBe('equalpower');
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions.panningModel overrides the app-wide default for one voice', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 }, panningModel: 'HRTF' });
    expect(spy.panners[0].panningModel).toBe('HRTF');
    spy.restore();
    sound.destroy();
  });

  test('voice.panningModel round-trips and writes through live to an existing panner', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    expect(voice.panningModel).toBeNull();
    voice.panningModel = 'HRTF';
    expect(voice.panningModel).toBe('HRTF');
    expect(spy.panners[0].panningModel).toBe('HRTF');

    voice.panningModel = null;
    expect(spy.panners[0].panningModel).toBe('equalpower');

    spy.restore();
    sound.destroy();
  });

  test('changing app.audio.spatial.panningModel affects only voices with no per-voice override', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    manager.spatial.panningModel = 'HRTF';
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 } });
    manager.play(sound, { position: { x: 0, y: 0 }, panningModel: 'equalpower' });
    expect(spy.panners[0].panningModel).toBe('HRTF');
    expect(spy.panners[1].panningModel).toBe('equalpower');
    spy.restore();
    sound.destroy();
  });
```

Append to `test/audio/spatial-smoothing.test.ts`:

```ts
  test('createSpatialSmoothingSettings() defaults panningModel to equalpower', () => {
    const settings = createSpatialSmoothingSettings();
    expect(settings.panningModel).toBe('equalpower');
  });
```

(Adjust the import at the top of `spatial-smoothing.test.ts` if `createSpatialSmoothingSettings` is not already imported there — check the file first.)

- [ ] **Step 5: Run tests, typecheck**

```bash
pnpm vitest run test/audio/voice-spatial.test.ts test/audio/spatial-smoothing.test.ts
pnpm typecheck
```

Expected: all pass, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/audio/spatial-smoothing.ts src/audio/BaseVoice.ts src/audio/Playable.ts src/audio/spatial-options.ts \
        test/audio/voice-spatial.test.ts test/audio/spatial-smoothing.test.ts
git commit -m "$(cat <<'EOF'
feat(audio): opt-in HRTF panning (app-wide default + per-voice override)

app.audio.spatial.panningModel defaults to 'equalpower' (cheap, works on
any speaker setup); Voice.panningModel/PlayOptions.panningModel let a game
opt a specific important emitter into 'HRTF' without paying the cost for
every simultaneous voice.
EOF
)"
```

---

## Task 4: Directional cone emitters (`orientation` + native cone properties)

**Files:**
- Modify: `src/audio/BaseVoice.ts`
- Modify: `src/audio/Playable.ts`
- Modify: `src/audio/spatial-options.ts` (four lines added to `seedVoiceFromPlayOptions`)
- Test: `test/audio/voice-spatial.test.ts` (append)

**Interfaces:**
- Consumes: `SmoothedAudioParam`/`SpatialSmoothingSettings` from `spatial-smoothing.ts` (Task 3), the existing position-tick pattern in `BaseVoice._tickSpatial()`.
- Produces: `Spatializable.orientation: number` (degrees, `SceneNode.rotation` convention), `coneInnerAngle: number`, `coneOuterAngle: number`, `coneOuterGain: number`. Same four fields on `PlayOptions` (optional).

- [ ] **Step 1: Add the four fields to `Spatializable` and `PlayOptions`**

In `src/audio/Playable.ts`, add to `Spatializable` (after `panningModel`):

```ts
  /**
   * Facing direction for cone attenuation, in degrees — same convention as
   * `SceneNode.rotation` (0° = local +X / "east", clockwise-positive on a
   * Y-down screen). Has no audible effect unless `coneInnerAngle`/
   * `coneOuterAngle` are narrowed below 360°. Default `0`.
   */
  orientation: number;
  /** Full-gain cone half-angle in degrees. Default `360` (omnidirectional — no cone). */
  coneInnerAngle: number;
  /** Falloff-to-`coneOuterGain` cone half-angle in degrees. Default `360`. */
  coneOuterAngle: number;
  /** Gain applied outside `coneOuterAngle`. Default `0`. */
  coneOuterGain: number;
```

and to `PlayOptions` (after `panningModel?`):

```ts
  /** Initial cone facing direction, in degrees (`SceneNode.rotation` convention). Default `0`. */
  orientation?: number;
  /** Initial full-gain cone half-angle. Default `360` (no cone). */
  coneInnerAngle?: number;
  /** Initial falloff cone half-angle. Default `360`. */
  coneOuterAngle?: number;
  /** Initial gain outside the outer cone. Default `0`. */
  coneOuterGain?: number;
```

- [ ] **Step 2: Wire cone angles into `BaseVoice._ensurePanner()`**

Add four private fields near `_panningModel`:

```ts
  private _orientation = 0;
  private _coneInnerAngle = 360;
  private _coneOuterAngle = 360;
  private _coneOuterGain = 0;
  private readonly _smoothOrientX = new SmoothedAudioParam();
  private readonly _smoothOrientY = new SmoothedAudioParam();
  private readonly _smoothOrientZ = new SmoothedAudioParam();
```

Add getter/setter pairs (grouped with the Task 1/3 accessors):

```ts
  public get orientation(): number {
    return this._orientation;
  }

  public set orientation(value: number) {
    this._orientation = value;
    this._writeOrientation();
  }

  public get coneInnerAngle(): number {
    return this._coneInnerAngle;
  }

  public set coneInnerAngle(value: number) {
    this._coneInnerAngle = value;
    if (this._panner !== null) {
      this._panner.coneInnerAngle = value;
    }
  }

  public get coneOuterAngle(): number {
    return this._coneOuterAngle;
  }

  public set coneOuterAngle(value: number) {
    this._coneOuterAngle = value;
    if (this._panner !== null) {
      this._panner.coneOuterAngle = value;
    }
  }

  public get coneOuterGain(): number {
    return this._coneOuterGain;
  }

  public set coneOuterGain(value: number) {
    this._coneOuterGain = value;
    if (this._panner !== null) {
      this._panner.coneOuterGain = value;
    }
  }
```

Add the orientation-writing helper (private, called from the `orientation` setter above and from `_tickSpatial` once a panner exists — see Step 3):

```ts
  /**
   * Convert `_orientation` (degrees, `SceneNode.rotation` convention) to a
   * unit XY vector (Z fixed at 0 — no Z axis in this engine) and write it
   * through the same smoothing layer used for position, so a fast-rotating
   * emitter's cone direction never zippers.
   */
  private _writeOrientation(): void {
    if (this._panner === null || this._ended) return;

    const radians = degreesToRadians(this._orientation);
    const x = Math.cos(radians);
    const y = Math.sin(radians);

    const panner = this._panner as unknown as Partial<{
      orientationX: AudioParam;
      orientationY: AudioParam;
      orientationZ: AudioParam;
      setOrientation: (x: number, y: number, z: number) => void;
    }>;
    const t = this._audioContext.currentTime;
    const settings = this._manager.spatial;

    if (panner.orientationX) {
      this._smoothOrientX.write(panner.orientationX, x, t, settings);
      this._smoothOrientY.write(panner.orientationY!, y, t, settings);
      this._smoothOrientZ.write(panner.orientationZ!, 0, t, settings);
    } else if (panner.setOrientation) {
      panner.setOrientation(x, y, 0);
    }
  }
```

Import `degreesToRadians`: change the existing `import { clamp } from '#math/utils';` to `import { clamp, degreesToRadians } from '#math/utils';`.

In `_ensurePanner()`, after the existing `panner.rolloffFactor = ...` line, add:

```ts
    panner.coneInnerAngle = this._coneInnerAngle;
    panner.coneOuterAngle = this._coneOuterAngle;
    panner.coneOuterGain = this._coneOuterGain;
```

and after `this._routeThroughPanner(panner);` / `this._panner = panner;`, call `this._writeOrientation();` once so a cone configured before the panner existed (e.g. via `PlayOptions.orientation`) is applied immediately rather than waiting for the next `_tickSpatial()`.

- [ ] **Step 3: Wire the four cone fields into the shared helper**

In `src/audio/spatial-options.ts`, add four lines to `seedVoiceFromPlayOptions` (after the `panningModel` line from Task 3):

```ts
  if (options.orientation !== undefined) voice.orientation = options.orientation;
  if (options.coneInnerAngle !== undefined) voice.coneInnerAngle = options.coneInnerAngle;
  if (options.coneOuterAngle !== undefined) voice.coneOuterAngle = options.coneOuterAngle;
  if (options.coneOuterGain !== undefined) voice.coneOuterGain = options.coneOuterGain;
```

`Sound.ts`/`AudioStream.ts`/`AudioGenerator.ts` are not touched — every `_createVoice` already calls this same helper (Task 1).

- [ ] **Step 4: Tests**

Append to `test/audio/voice-spatial.test.ts` (extend `MockPannerNode`/`setupPannerSpy` first to include `coneInnerAngle`/`coneOuterAngle`/`coneOuterGain` and `orientationX`/`orientationY`/`orientationZ` fields, mirroring the existing `positionX`/`positionY`/`positionZ` shape):

```ts
  test('orientation and cone angles default to omnidirectional (no cone)', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 } });
    const panner = spy.panners[0];
    expect(panner.coneInnerAngle).toBe(360);
    expect(panner.coneOuterAngle).toBe(360);
    expect(panner.coneOuterGain).toBe(0);
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions cone fields configure the PannerNode at play time', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, {
      position: { x: 0, y: 0 },
      orientation: 90,
      coneInnerAngle: 30,
      coneOuterAngle: 60,
      coneOuterGain: 0.2,
    });
    const panner = spy.panners[0];
    expect(panner.coneInnerAngle).toBe(30);
    expect(panner.coneOuterAngle).toBe(60);
    expect(panner.coneOuterGain).toBeCloseTo(0.2);
    expect(panner.orientationX.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0, 5), expect.any(Number));
    expect(panner.orientationY.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(1, 5), expect.any(Number));
    spy.restore();
    sound.destroy();
  });

  test('orientation degree 0 maps to the local +X axis (SceneNode.rotation convention)', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 }, orientation: 0, coneInnerAngle: 10 });
    const panner = spy.panners[0];
    expect(panner.orientationX.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(1, 5), expect.any(Number));
    expect(panner.orientationY.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0, 5), expect.any(Number));
    spy.restore();
    sound.destroy();
  });

  test('voice.orientation and cone setters round-trip and write through live', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    voice.coneInnerAngle = 45;
    voice.coneOuterAngle = 90;
    voice.coneOuterGain = 0.1;
    expect(voice.coneInnerAngle).toBe(45);
    expect(spy.panners[0].coneInnerAngle).toBe(45);

    spy.restore();
    sound.destroy();
  });
```

(`expect.closeTo` needs an explicit precision argument matching Vitest's API — verify the exact call signature (`expect.closeTo(value, numDigits)`) against the Vitest version in `package.json` before running; adjust if the installed version's typing differs.)

- [ ] **Step 5: Run tests, typecheck**

```bash
pnpm vitest run test/audio/voice-spatial.test.ts
pnpm typecheck
```

Expected: all pass, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/audio/BaseVoice.ts src/audio/Playable.ts src/audio/spatial-options.ts \
        test/audio/voice-spatial.test.ts
git commit -m "$(cat <<'EOF'
feat(audio): directional cone emitters (orientation + native PannerNode cone)

orientation uses the SceneNode.rotation degree convention for consistency
with every other rotatable object in the engine; deliberately not
auto-synced with voice.follow() — a game that wants them coupled sets
voice.orientation = node.rotation itself each frame.
EOF
)"
```

---

## Task 5: Doppler shift

**Files:**
- Modify: `src/audio/spatial-smoothing.ts`
- Modify: `src/audio/BaseVoice.ts`
- Modify: `src/audio/AudioListener.ts`
- Modify: `src/audio/Playable.ts`
- Modify: `src/audio/SoundVoice.ts`
- Modify: `src/audio/AudioStreamVoice.ts`
- Modify: `src/audio/spatial-options.ts` (one line added to `seedVoiceFromPlayOptions`)
- Test: `test/audio/voice-spatial.test.ts` (append), `test/audio/audio-listener.test.ts` (append)

**Interfaces:**
- Consumes: `SpatialSmoothingSettings` (Task 3), `BaseVoice._tickSpatial()`/position-tracking pattern (Task 1/4).
- Produces: `Spatializable.velocity: Vector | { x: number; y: number } | null` (new — did not exist on `Voice` before this task). `AudioListener.velocity` becomes functionally real (the field already exists but was never used). `SpatialSmoothingSettings.dopplerFactor: number` (default `0`), `speedOfSound: number`. A new protected, overridable (non-abstract) `BaseVoice._applyDopplerRate(ratio: number): void` hook (default no-op), overridden by `SoundVoice` and `AudioStreamVoice` (the two voice types with a meaningful, live-adjustable playback rate — `AudioGeneratorVoice`'s rate is already documented as "inert", and `InputVoice`/`NoopVoice` have no source rate to modulate at all).

- [ ] **Step 1: Extend `SpatialSmoothingSettings`**

In `src/audio/spatial-smoothing.ts`, add to the interface (after `panningModel`):

```ts
  /**
   * Doppler pitch-shift strength multiplier. `0` (default) disables Doppler
   * entirely — even when velocity data is available on a voice or the
   * listener, no `playbackRate` modulation is applied unless this is set
   * above zero. `1` is physically scaled (relative to {@link speedOfSound});
   * many games deliberately exaggerate beyond `1` for player feedback.
   */
  dopplerFactor: number;
  /**
   * Reference speed (world units per second) used to scale the Doppler
   * effect. World units have no fixed physical scale across different
   * games (pixels, meters, tiles), so this is a tunable, not a physical
   * constant — pick a value where your game's typical emitter/listener
   * speeds produce a noticeable but not extreme shift.
   */
  speedOfSound: number;
```

and to `createSpatialSmoothingSettings()`:

```ts
export const createSpatialSmoothingSettings = (): SpatialSmoothingSettings => ({
  smoothing: DEFAULT_SPATIAL_SMOOTHING,
  teleportThreshold: DEFAULT_TELEPORT_THRESHOLD,
  panningModel: 'equalpower',
  dopplerFactor: 0,
  speedOfSound: 1000,
});
```

(`speedOfSound: 1000` world-units/second is a starting default in the same numeric neighborhood as the existing `maxDistance` default of `1000` — reasonable for typical pixel-scale game worlds; document as tunable, not physically meaningful.)

- [ ] **Step 2: Add `velocity` to `Spatializable` and `PlayOptions`**

In `src/audio/Playable.ts`, add to `Spatializable` (after `coneOuterGain`):

```ts
  /**
   * World-space velocity of the source (world units/second), or `null`.
   * Feeds the Doppler calculation (`app.audio.spatial.dopplerFactor`) —
   * has no other effect. Explicit; when `null` and `follow(node)` is
   * active, velocity is auto-derived each frame from the tracked node's
   * position delta instead.
   */
  velocity: Vector | { x: number; y: number } | null;
```

and to `PlayOptions` (after `coneOuterGain?`):

```ts
  /** Initial velocity for Doppler. See {@link Spatializable.velocity}. */
  velocity?: { x: number; y: number } | Vector;
```

- [ ] **Step 3: Add `velocity` + Doppler computation to `BaseVoice`**

Add fields (near the position/follow state):

```ts
  private _velocity: Vector | null = null;
  private _explicitVelocity = false;
  private _lastTickPosition: { x: number; y: number } | null = null;
  private _lastTickTime = 0;
```

Add the getter/setter:

```ts
  public get velocity(): Vector | null {
    return this._velocity;
  }

  public set velocity(value: Vector | { x: number; y: number } | null) {
    if (this._ended) return;

    if (value === null) {
      if (this._velocity !== null) {
        this._velocity.destroy();
        this._velocity = null;
      }
      this._explicitVelocity = false;
      return;
    }

    if (this._velocity === null) {
      this._velocity = new Vector(value.x, value.y);
    } else {
      this._velocity.set(value.x, value.y);
    }
    this._explicitVelocity = true;
  }
```

Add the overridable Doppler-rate hook (non-abstract, default no-op — placed next to the two existing `abstract` hooks at the bottom of the class, but NOT itself abstract):

```ts
  /**
   * Apply a Doppler pitch-shift multiplier on top of whatever playback rate
   * the voice already has (never overwrite the user's own explicit rate —
   * multiply it). Default no-op: voice types with no meaningful, live
   * rate parameter (`AudioGeneratorVoice`'s rate is documented as inert;
   * `InputVoice`/`NoopVoice` have no source to modulate) simply don't
   * override this. Overridden by {@link SoundVoice} and
   * {@link AudioStreamVoice}.
   */
  protected _applyDopplerRate(_ratio: number): void {
    // no-op default
  }
```

Now extend `_tickSpatial()` to compute velocity (explicit or auto-derived) and the Doppler ratio. Replace the current method body with:

```ts
  public _tickSpatial(): void {
    if (this._panner === null || this._ended) return;

    let x: number;
    let y: number;

    if (this._followNode !== null) {
      const transform = this._followNode.getWorldTransform();
      x = transform.x;
      y = transform.y;
    } else if (this._position !== null) {
      x = this._position.x;
      y = this._position.y;
    } else {
      return;
    }

    const panner = this._panner as unknown as Partial<{
      positionX: AudioParam;
      positionY: AudioParam;
      positionZ: AudioParam;
      setPosition: (x: number, y: number, z: number) => void;
    }>;
    const t = this._audioContext.currentTime;
    const settings = this._manager.spatial;
    if (panner.positionX) {
      this._smoothX.write(panner.positionX, x, t, settings);
      this._smoothY.write(panner.positionY!, y, t, settings);
      this._smoothZ.write(panner.positionZ!, 0, t, settings);
    } else if (panner.setPosition) {
      panner.setPosition(x, y, 0);
    }

    this._writeOrientation();
    this._tickDoppler(x, y, t, settings);
  }

  /**
   * Resolve this tick's effective velocity (explicit `velocity`, else
   * auto-derived from the position delta since the last tick when
   * following a node), then compute and apply the Doppler ratio against
   * the listener. No-op entirely when `dopplerFactor` is `0` (the default)
   * — genuinely zero cost when the feature is unused.
   */
  private _tickDoppler(x: number, y: number, now: number, settings: SpatialSmoothingSettings): void {
    if (settings.dopplerFactor === 0) return;

    let vx: number;
    let vy: number;

    if (this._explicitVelocity && this._velocity !== null) {
      vx = this._velocity.x;
      vy = this._velocity.y;
    } else if (this._lastTickPosition !== null && this._lastTickTime > 0) {
      const dt = now - this._lastTickTime;
      if (dt <= 0) {
        vx = 0;
        vy = 0;
      } else {
        vx = (x - this._lastTickPosition.x) / dt;
        vy = (y - this._lastTickPosition.y) / dt;
      }
    } else {
      vx = 0;
      vy = 0;
    }

    this._lastTickPosition = { x, y };
    this._lastTickTime = now;

    const listener = this._manager.listener;
    const dx = this._... // see note below
  }
```

**Implementation note for the last block (do not paste the placeholder above verbatim):** the exact relative-velocity-projected-onto-line-of-sight formula and the listener-side symmetric velocity resolution are specified precisely enough in the design doc's §5 to derive, but the concrete arithmetic is an implementation decision for whoever writes this code, not dictated line-by-line here. Implement `_tickDoppler` so that:

1. It computes the vector from the listener's current position (`this._manager.listener.position`) to `(x, y)`, normalizes it (guard against a zero-length vector — same position — by skipping the Doppler write for that tick).
2. It projects both this voice's velocity `(vx, vy)` and the listener's effective velocity (`this._manager.listener.velocity` if explicitly set on the listener, else the listener's own auto-derived velocity — see Step 4) onto that line-of-sight unit vector, producing a scalar "recede/approach" speed for each side.
3. It computes a ratio using `settings.speedOfSound` as the reference scale and `settings.dopplerFactor` as the exaggeration multiplier — e.g. `ratio = 1 + settings.dopplerFactor * ((listenerApproachSpeed - sourceRecedeSpeed) / settings.speedOfSound)`, clamped to a sane positive range (e.g. `[0.1, 4]`, matching the existing `playbackRate` clamp range already used elsewhere in this file — see `clamp(init.playbackRate, 0.1, 20)` in `BaseVoiceInit` consumers for the precedent range, though Doppler's own clamp range is a separate, tighter decision left to the implementer since a 20x pitch shift from Doppler alone would never be desirable).
4. It calls `this._applyDopplerRate(ratio)`.

This is the one place in this plan where the exact formula is intentionally left to the implementer's judgment rather than fully dictated — write a focused unit test (Step 5 below) asserting the CONCRETE formula you chose against known inputs, and self-review it against design spec §5 before moving on.

- [ ] **Step 4: Make `AudioListener.velocity` real, with the same auto-derivation fallback**

In `src/audio/AudioListener.ts`, add private fields mirroring `BaseVoice`'s new ones:

```ts
  private _explicitVelocity = false;
  private _lastTickPosition: { x: number; y: number } | null = null;
  private _lastTickTime = 0;
```

Change the public `velocity` field (currently `public readonly velocity: Vector = new Vector(0, 0);`) to a private-backed getter/setter pair so setting it can flag `_explicitVelocity`:

```ts
  private readonly _velocity: Vector = new Vector(0, 0);

  public get velocity(): Vector {
    return this._velocity;
  }

  public set velocity(value: { x: number; y: number } | Vector) {
    this._velocity.set(value.x, value.y);
    this._explicitVelocity = true;
  }
```

(This is a narrow, additive change to a field that was previously `readonly` and unused — grep the codebase for any existing `listener.velocity.set(...)`-style external mutation before making the field settable, to confirm nothing outside this file currently relies on the old always-`readonly`-object mutation pattern; if something does, adapt it to the new setter.)

In `_tick()`, after resolving `this.position` (inside `if (this.target !== null) { this._readTargetPosition(); }`), add auto-derivation when no explicit velocity was set:

```ts
  public _tick(): void {
    if (this.target !== null) {
      this._readTargetPosition();

      if (!this._explicitVelocity && this._ctx !== null) {
        const now = this._ctx.currentTime;
        if (this._lastTickPosition !== null && this._lastTickTime > 0) {
          const dt = now - this._lastTickTime;
          if (dt > 0) {
            this._velocity.set((this.position.x - this._lastTickPosition.x) / dt, (this.position.y - this._lastTickPosition.y) / dt);
          }
        }
        this._lastTickPosition = { x: this.position.x, y: this.position.y };
        this._lastTickTime = now;
      }
    }
    // ...existing positionX/Y/Z smoothing write below, unchanged...
```

- [ ] **Step 5: Override `_applyDopplerRate` in `SoundVoice` and `AudioStreamVoice`**

In `src/audio/SoundVoice.ts`, add (near the existing `playbackRate` getter/setter, using the existing private `_source`/`_playbackRate` fields already established for `RatePitched`):

```ts
  protected override _applyDopplerRate(ratio: number): void {
    if (this._ended) return;
    this._source.playbackRate.setTargetAtTime(this._playbackRate * ratio, this._audioContext.currentTime, 0.01);
  }
```

**Important:** unlike `SoundVoice` (which already caches its base rate in a private `_playbackRate` field, independent of what's actually written to the native node), `AudioStreamVoice`'s current `playbackRate` getter/setter (in `src/audio/AudioStreamVoice.ts`, around line 108) reads and writes `this._element.playbackRate` directly, with no separate base-rate cache:

```ts
  public get playbackRate(): number {
    return this._element.playbackRate;
  }

  public set playbackRate(value: number) {
    this._element.playbackRate = clamp(value, 0.1, 20);
  }
```

If `_applyDopplerRate` multiplied `this.playbackRate` (the getter) directly, each tick's Doppler ratio would compound onto the PREVIOUS tick's already-Doppler-modulated rate instead of the user's true base rate — drifting further from the correct value every frame. Fix this by adding a private base-rate cache, mirroring `SoundVoice`'s pattern, and updating the existing getter/setter to use it:

```ts
  private _basePlaybackRate: number;
```

In the constructor, replace `this._element.playbackRate = init.playbackRate;` with:

```ts
    this._basePlaybackRate = init.playbackRate;
    this._element.playbackRate = init.playbackRate;
```

Replace the existing getter/setter:

```ts
  public get playbackRate(): number {
    return this._basePlaybackRate;
  }

  public set playbackRate(value: number) {
    this._basePlaybackRate = clamp(value, 0.1, 20);
    this._element.playbackRate = this._basePlaybackRate;
  }
```

Then add the Doppler hook, reading from the cached base rate (never the live element value):

```ts
  protected override _applyDopplerRate(ratio: number): void {
    if (this._ended) return;
    this._element.playbackRate = clamp(this._basePlaybackRate * ratio, 0.1, 20);
  }
```

Do NOT add an override to `AudioGeneratorVoice` (rate is already documented as inert there) or `InputVoice`/`NoopVoice` (no source rate to modulate) — they inherit `BaseVoice`'s no-op default.

- [ ] **Step 6: Wire `velocity` into the shared helper**

In `src/audio/spatial-options.ts`, add one line to `seedVoiceFromPlayOptions` (after the cone fields from Task 4):

```ts
  if (options.velocity !== undefined) voice.velocity = options.velocity;
```

`Sound.ts`/`AudioStream.ts`/`AudioGenerator.ts` are not touched — this completes the shared helper's full field set (position, distance model, panning model, cone/orientation, velocity), all seeded through one function call per `_createVoice` implementation, established once in Task 1.

- [ ] **Step 7: Tests**

Append to `test/audio/voice-spatial.test.ts`:

```ts
  test('dopplerFactor 0 (default) applies no playbackRate modulation regardless of velocity', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 } }) as SoundVoice;
    const rateSpy = vi.spyOn(voice, 'playbackRate', 'set');
    manager.update();
    expect(rateSpy).not.toHaveBeenCalled();
    spy.restore();
    sound.destroy();
  });

  test('a source approaching a stationary listener with dopplerFactor > 0 raises its effective playbackRate', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    manager.spatial.dopplerFactor = 1;
    manager.spatial.speedOfSound = 100;
    manager.listener.position.set(0, 0);
    const sound = new Sound(createAudioBufferStub());
    // Source starts far away on the +X axis and, between ticks, moves toward the listener.
    const voice = manager.play(sound, { position: { x: 500, y: 0 } }) as SoundVoice;
    manager.update();
    voice.position = { x: 400, y: 0 }; // moved 100 units toward the listener
    manager.update();
    // Exact rate value depends on the implementer's chosen formula (see plan Task 5 Step 3) —
    // assert direction (> 1, i.e. pitched up while approaching), not an exact number.
    const source = (voice as unknown as { _source: { playbackRate: { setTargetAtTime: MockInstance } } })._source;
    const lastCallArgs = source.playbackRate.setTargetAtTime.mock.calls.at(-1);
    expect(lastCallArgs?.[0]).toBeGreaterThan(1);
    spy.restore();
    sound.destroy();
  });

  test('velocity round-trips and can be cleared back to auto-derivation', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });
    expect(voice.velocity).toBeNull();
    voice.velocity = { x: 10, y: -5 };
    expect(voice.velocity!.x).toBe(10);
    voice.velocity = null;
    expect(voice.velocity).toBeNull();
    sound.destroy();
  });
```

Append to `test/audio/audio-listener.test.ts` (read the file first to match its existing setup/mocking conventions before appending):

```ts
  test('listener.velocity is settable and marks it explicit (no auto-derivation overwrite)', () => {
    const listener = new AudioListener();
    listener.velocity = { x: 5, y: 5 };
    expect(listener.velocity.x).toBe(5);
    expect(listener.velocity.y).toBe(5);
  });
```

(A full auto-derivation-from-target-movement test for the listener requires driving `_tick()` across two frames with a moving target and a real or stubbed `AudioContext.currentTime` — follow whatever `AudioContext`/`currentTime` stubbing pattern `audio-listener.test.ts` already establishes for its existing position-smoothing tests; do not invent a new stubbing approach if one already exists in the file.)

- [ ] **Step 8: Run tests, typecheck**

```bash
pnpm vitest run test/audio/voice-spatial.test.ts test/audio/audio-listener.test.ts
pnpm typecheck
```

Expected: all pass, no errors.

- [ ] **Step 9: Commit**

```bash
git add src/audio/spatial-smoothing.ts src/audio/BaseVoice.ts src/audio/AudioListener.ts src/audio/Playable.ts \
        src/audio/SoundVoice.ts src/audio/AudioStreamVoice.ts src/audio/spatial-options.ts \
        test/audio/voice-spatial.test.ts test/audio/audio-listener.test.ts
git commit -m "$(cat <<'EOF'
feat(audio): Doppler shift (velocity-driven playbackRate modulation)

Web Audio has no native Doppler support — dopplerFactor was removed from
the spec years ago. Velocity is explicit-or-auto-derived from position
deltas, symmetric for both Voice and AudioListener; dopplerFactor defaults
to 0 (off) so no game gets a surprising pitch shift from velocity tracked
for unrelated reasons.
EOF
)"
```

---

## Task 6: Guide docs, API docs regeneration, full verification gate

**Files:**
- Modify: `site/src/content/guide/audio/spatial-audio.mdx`
- Regenerate: `site/src/content/api/*.json` (via `pnpm docs:api:generate`, never by hand)

**Interfaces:**
- Consumes: everything from Tasks 1-5 (this task only documents and verifies the already-implemented API).

- [ ] **Step 1: Extend `spatial-audio.mdx` with panningModel, cone, and Doppler sections**

Read the guide's current full content first (already partially migrated in Task 2 Step 6). Add three new subsections after the existing distance-model content, following the guide's established style (prose + fenced `ts` code sample per concept, matching the file's existing structure):

- A "Panning model: equalpower vs HRTF" section: explain the cost/quality tradeoff (mirroring design spec §4's explanation), show `app.audio.spatial.panningModel = 'HRTF'` for a global switch and `app.audio.play(sound, { position, panningModel: 'HRTF' })` for a per-source override.
- A "Directional emitters (cone)" section: explain that `orientation` follows the same convention as `SceneNode.rotation`, that it has no effect without narrowing `coneInnerAngle`/`coneOuterAngle`, and that it is NOT auto-synced with `voice.follow()` — show a short example of a rotating NPC manually syncing `voice.orientation = npc.rotation` each frame.
- A "Doppler shift" section: explain that it's off by default (`dopplerFactor: 0`), how to enable it (`app.audio.spatial.dopplerFactor = 1`), and that velocity is either explicit (`voice.velocity = {...}`) or auto-derived from `follow(node)`'s position deltas when omitted.

- [ ] **Step 2: Typecheck the guides**

```bash
pnpm typecheck:guides
```

Expected: no errors.

- [ ] **Step 3: Regenerate the API docs**

```bash
pnpm docs:api:generate
```

Expected: `site/src/content/api/sound.json`, `playable.json` (or wherever `Spatializable`/`PlayOptions` are documented — check the actual generated filenames), and `spatial-smoothing`-related JSON files are regenerated with the new fields; `Sound`'s JSON loses its removed spatial members.

```bash
git status --short site/src/content/api
```

Expected: shows the regenerated files reflecting Tasks 1-5's API surface changes.

- [ ] **Step 4: Full verification gate**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. This is the first full-repo run for the entire feature — everything up to now was scoped to directly affected files.

- [ ] **Step 5: Commit**

```bash
git add site/src/content/guide/audio/spatial-audio.mdx site/src/content/api
git commit -m "$(cat <<'EOF'
docs(audio): document HRTF panning, cone emitters, and Doppler shift; regenerate API docs
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Design spec §1 non-goals (no Z axis, no `ImpulseResponse`, no `View`-following emitters) — respected throughout; no task introduces any of them. §3 (Sound loses all spatial state, moves to Voice/PlayOptions) — Task 1. §4 (panningModel default/override, cone/orientation, explicit-not-auto-synced) — Tasks 3-4. §5 (Doppler, velocity explicit-or-auto, dopplerFactor default 0, not an AudioEffect) — Task 5. §6 (listener/View interaction) — no code change needed, confirmed unaffected by this plan's changes (the existing `AudioListenerTarget` handling in `AudioListener._readTargetPosition()` is untouched). §7 (migration impact, all 3 examples + guide) — Task 2. §8 (testing approach) — corrected from the design doc's over-broad mention of the `browser-audio-chromium` Playwright project (that infrastructure lives in `packages/exojs-audio-fx`, a different package, and Doppler here is pure JS parameter math, not sample-level DSP) to jsdom-level math verification tests matching this codebase's actual `test/audio/` conventions.
- **Placeholder scan:** Every step gives exact code or an exact command, except the one explicitly-flagged exception in Task 5 Step 3 (the precise Doppler ratio formula), which is deliberately left as an implementer decision per the design spec's own framing ("the exact formula is a plan-level/implementation-level decision") — bounded by a concrete list of requirements (line-of-sight projection, `speedOfSound`/`dopplerFactor` tunables, sane clamp range) and a concrete test asserting the chosen formula's directional correctness.
- **Type consistency:** `Spatializable.velocity`/`panningModel`/`orientation`/`coneInnerAngle`/`coneOuterAngle`/`coneOuterGain` match exactly between `Playable.ts`'s interface, `BaseVoice.ts`'s implementation, and every `PlayOptions` consumption site (`Sound.ts`, `AudioStream.ts`, `AudioGenerator.ts`) across Tasks 1, 3, 4, and 5. `DistanceModel` is moved (not duplicated) from `Sound.ts` to `Playable.ts` in Task 1 Step 1, and every later task's code samples reference it only via that new location.
- **Duplication fix (pre-flight, owner-requested):** the original draft had each of Tasks 1/3/4/5 independently touching `Sound.ts`, `AudioStream.ts`, and `AudioGenerator.ts` to seed their own new `PlayOptions` field — 3 files × 4 tasks of near-identical conditional-assignment blocks. Replaced with a single shared `seedVoiceFromPlayOptions()` helper (`src/audio/spatial-options.ts`, introduced in Task 1), which each `_createVoice` implementation calls exactly once; Tasks 3/4/5 now only ever add lines to that one function.
- **Correctness bug caught during self-review (fixed inline, Task 5 Step 5):** `AudioStreamVoice`'s existing `playbackRate` getter/setter has no separate base-rate cache — it reads/writes `this._element.playbackRate` directly. A naive `_applyDopplerRate` reading `this.playbackRate` would have compounded each tick's Doppler ratio onto the previous tick's already-modulated rate instead of the user's true base rate, drifting further off every frame. Fixed by adding a `_basePlaybackRate` cache mirroring `SoundVoice`'s existing (already-correct) pattern, and updating the existing getter/setter to route through it.
