import { getAudioContext } from '#audio/audio-context';
import type { AudioBus } from '#audio/AudioBus';
import type { AudioEffect } from '#audio/AudioEffect';
import type { DistanceModel, Pausable, Playable, PlayOptions, Spatializable, Voice } from '#audio/Playable';
import type { Application } from '#core/Application';
import { SceneAvailability } from '#core/SceneAvailability';
import type { SceneNode } from '#core/SceneNode';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { Destroyable } from '#core/types';
import { Vector } from '#math/Vector';

const isPausable = (voice: Voice): voice is Voice & Pausable => 'pause' in voice && 'resume' in voice;

/** Options accepted by {@link SceneAudio.play}, extending the base {@link PlayOptions}. */
export interface SceneAudioPlayOptions extends PlayOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely — today's behavior.
   * `'active'` freezes the moment the scene pauses, resumes when it resumes.
   * `'paused'` is the mirror image: plays only while the scene is paused.
   * Has no effect on a {@link Voice} that doesn't support {@link Pausable}.
   *
   * Applied only at the scene's pause/resume transitions, not re-checked at
   * creation time — a voice started while the scene is already paused plays
   * immediately and is only corrected at the next pause/resume cycle.
   */
  when?: SceneAvailability;
}

/** Options accepted by {@link SceneAudio.add}. */
export interface SceneAudioTrackOptions {
  /** See {@link SceneAudioPlayOptions.when}. */
  when?: SceneAvailability;
}

/**
 * The scalar {@link Spatializable} fields {@link PendingVoice} buffers before
 * flush. `position`/`velocity` are held separately — they own a {@link Vector}
 * that has to be released — and `follow` is a call, not a value.
 */
interface BufferedSpatialWrites {
  distanceModel?: DistanceModel;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  panningModel?: PanningModelType | null;
  orientation?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
}

/**
 * Copy `value` into `target`, allocating or releasing the {@link Vector} as
 * needed. Mirrors how `BaseVoice` stores its own spatial points: the caller's
 * object is never retained.
 */
function copyPoint(target: Vector | null, value: Vector | { x: number; y: number } | null): Vector | null {
  if (value === null) {
    target?.destroy();

    return null;
  }

  if (target === null) {
    return new Vector(value.x, value.y);
  }

  target.set(value.x, value.y);

  return target;
}

/**
 * Stand-in {@link Voice} returned by {@link SceneAudio.play} while the owning
 * scope is still `Preparing`. Buffers `volume`/`bus`/effect and
 * {@link Spatializable} writes and replays them onto the real voice once
 * {@link PendingVoice._flush} runs at activation; `stop()` before flush
 * cancels playback entirely — the real voice is never created. Narrower than a
 * real `Voice`: capability mixins (`Pausable`, `Seekable`, …) are unavailable
 * until flush, and reading `bus` before flush returns `undefined` (despite the
 * type) unless an explicit `options.bus` override was given — the manager's
 * default bus isn't resolvable until the real voice exists. A documented
 * limitation of Preparing-phase playback, not a general `Voice` capability.
 * @internal
 */
class PendingVoice implements Voice {
  private _real: Voice | null = null;
  private _cancelled = false;
  private _volume: number;
  private _bus: AudioBus | undefined;
  private readonly _pendingEffects: AudioEffect[] = [];
  private readonly _dummyOutput: AudioNode;
  private readonly _spatial: BufferedSpatialWrites = {};
  private _followTarget: SceneNode | null | undefined;
  private _position: Vector | null = null;
  private _positionWritten = false;
  private _velocity: Vector | null = null;
  private _velocityWritten = false;
  public readonly onEnd = new Signal();
  /** The `when` policy this voice was created with — carried across to the real `Voice` at flush. */
  public readonly when: SceneAvailability;

  public constructor(
    private readonly _createReal: () => Voice,
    options: SceneAudioPlayOptions,
  ) {
    this._volume = options.volume ?? 1;
    this._bus = options.bus;
    this.when = options.when ?? SceneAvailability.Always;
    this._dummyOutput = getAudioContext().createGain();
  }

  public get ended(): boolean {
    return this._real?.ended ?? this._cancelled;
  }

  public get output(): AudioNode {
    return this._real?.output ?? this._dummyOutput;
  }

  public get volume(): number {
    return this._real?.volume ?? this._volume;
  }

  public set volume(value: number) {
    this._volume = value;

    if (this._real) {
      this._real.volume = value;
    }
  }

  public get bus(): AudioBus {
    return this._real?.bus ?? this._bus!;
  }

  public set bus(value: AudioBus) {
    this._bus = value;

    if (this._real) {
      this._real.bus = value;
    }
  }

  public fade(to: number, ms: number): void {
    if (this._real) {
      this._real.fade(to, ms);
    } else {
      // Nothing is playing yet — best effort is to apply the target volume
      // immediately once flushed; the ramp itself has nothing to animate.
      this._volume = to;
    }
  }

  public stop(fadeMs?: number): void {
    if (this._real) {
      this._real.stop(fadeMs);

      return;
    }

    if (!this._cancelled) {
      this._cancelled = true;
      this._releasePoints();
      this.onEnd.dispatch();
    }
  }

  public addEffect(effect: AudioEffect): this {
    if (this._real) {
      this._real.addEffect(effect);
    } else {
      this._pendingEffects.push(effect);
    }

    return this;
  }

  public removeEffect(effect: AudioEffect): this {
    if (this._real) {
      this._real.removeEffect(effect);
    } else {
      const index = this._pendingEffects.indexOf(effect);

      if (index !== -1) {
        this._pendingEffects.splice(index, 1);
      }
    }

    return this;
  }

  // Spatializable — buffered like volume/bus above. Only what the caller
  // actually wrote is replayed at flush: the real voice is created from the
  // same PlayOptions, so blindly writing defaults would undo the spatial
  // values the play call already carried.

  public get position(): Vector | null {
    return this._real?.position ?? this._position;
  }

  public set position(value: Vector | { x: number; y: number } | null) {
    this._positionWritten = true;
    this._position = copyPoint(this._position, value);

    if (this._real) {
      this._real.position = value;
    }
  }

  public follow(node: SceneNode | null): void {
    this._followTarget = node;

    if (this._real) {
      this._real.follow(node);
    }
  }

  public get distanceModel(): DistanceModel {
    return this._real?.distanceModel ?? this._spatial.distanceModel ?? 'linear';
  }

  public set distanceModel(value: DistanceModel) {
    this._spatial.distanceModel = value;

    if (this._real) {
      this._real.distanceModel = value;
    }
  }

  public get refDistance(): number {
    return this._real?.refDistance ?? this._spatial.refDistance ?? 50;
  }

  public set refDistance(value: number) {
    this._spatial.refDistance = value;

    if (this._real) {
      this._real.refDistance = value;
    }
  }

  public get maxDistance(): number {
    return this._real?.maxDistance ?? this._spatial.maxDistance ?? 1000;
  }

  public set maxDistance(value: number) {
    this._spatial.maxDistance = value;

    if (this._real) {
      this._real.maxDistance = value;
    }
  }

  public get rolloffFactor(): number {
    return this._real?.rolloffFactor ?? this._spatial.rolloffFactor ?? 1;
  }

  public set rolloffFactor(value: number) {
    this._spatial.rolloffFactor = value;

    if (this._real) {
      this._real.rolloffFactor = value;
    }
  }

  public get panningModel(): PanningModelType | null {
    return this._real?.panningModel ?? this._spatial.panningModel ?? null;
  }

  public set panningModel(value: PanningModelType | null) {
    this._spatial.panningModel = value;

    if (this._real) {
      this._real.panningModel = value;
    }
  }

  public get orientation(): number {
    return this._real?.orientation ?? this._spatial.orientation ?? 0;
  }

  public set orientation(value: number) {
    this._spatial.orientation = value;

    if (this._real) {
      this._real.orientation = value;
    }
  }

  public get coneInnerAngle(): number {
    return this._real?.coneInnerAngle ?? this._spatial.coneInnerAngle ?? 360;
  }

  public set coneInnerAngle(value: number) {
    this._spatial.coneInnerAngle = value;

    if (this._real) {
      this._real.coneInnerAngle = value;
    }
  }

  public get coneOuterAngle(): number {
    return this._real?.coneOuterAngle ?? this._spatial.coneOuterAngle ?? 360;
  }

  public set coneOuterAngle(value: number) {
    this._spatial.coneOuterAngle = value;

    if (this._real) {
      this._real.coneOuterAngle = value;
    }
  }

  public get coneOuterGain(): number {
    return this._real?.coneOuterGain ?? this._spatial.coneOuterGain ?? 0;
  }

  public set coneOuterGain(value: number) {
    this._spatial.coneOuterGain = value;

    if (this._real) {
      this._real.coneOuterGain = value;
    }
  }

  public get velocity(): Vector | null {
    return this._real?.velocity ?? this._velocity;
  }

  public set velocity(value: Vector | { x: number; y: number } | null) {
    this._velocityWritten = true;
    this._velocity = copyPoint(this._velocity, value);

    if (this._real) {
      this._real.velocity = value;
    }
  }

  /**
   * Start real playback. No-op if already flushed or cancelled via
   * {@link PendingVoice.stop}. Returns the newly created real {@link Voice}
   * so the caller (`SceneAudio._flushPending`) can swap its own tracking to
   * the capability-bearing voice; returns `null` when there was nothing to
   * flush.
   */
  public _flush(): Voice | null {
    if (this._cancelled || this._real !== null) {
      return null;
    }

    const real = this._createReal();

    this._real = real;
    real.volume = this._volume;

    if (this._bus !== undefined) {
      real.bus = this._bus;
    }

    for (const effect of this._pendingEffects) {
      real.addEffect(effect);
    }

    this._pendingEffects.length = 0;
    this._replaySpatial(real);
    real.onEnd.add((): void => {
      this.onEnd.dispatch();
    });

    return real;
  }

  /**
   * Replay the buffered spatial writes onto the real voice. Only fields the
   * caller actually wrote are applied: `_createReal()` builds the voice from
   * the same `PlayOptions`, so writing the defaults here would overwrite the
   * spatial values the play call already carried.
   */
  private _replaySpatial(real: Voice): void {
    if (this._positionWritten) {
      real.position = this._position;
    }

    if (this._velocityWritten) {
      real.velocity = this._velocity;
    }

    if (this._followTarget !== undefined) {
      real.follow(this._followTarget);
    }

    const spatial = this._spatial;

    if (spatial.distanceModel !== undefined) {
      real.distanceModel = spatial.distanceModel;
    }

    if (spatial.refDistance !== undefined) {
      real.refDistance = spatial.refDistance;
    }

    if (spatial.maxDistance !== undefined) {
      real.maxDistance = spatial.maxDistance;
    }

    if (spatial.rolloffFactor !== undefined) {
      real.rolloffFactor = spatial.rolloffFactor;
    }

    if (spatial.panningModel !== undefined) {
      real.panningModel = spatial.panningModel;
    }

    if (spatial.orientation !== undefined) {
      real.orientation = spatial.orientation;
    }

    if (spatial.coneInnerAngle !== undefined) {
      real.coneInnerAngle = spatial.coneInnerAngle;
    }

    if (spatial.coneOuterAngle !== undefined) {
      real.coneOuterAngle = spatial.coneOuterAngle;
    }

    if (spatial.coneOuterGain !== undefined) {
      real.coneOuterGain = spatial.coneOuterGain;
    }

    this._releasePoints();
  }

  /** Hand the buffered {@link Vector}s back to the pool. */
  private _releasePoints(): void {
    this._position?.destroy();
    this._position = null;
    this._velocity?.destroy();
    this._velocity = null;
  }
}

/**
 * Scene-bound audio facade. Playback started or added here uses scene
 * lifetime: every tracked {@link Voice} is stopped when the owning scene ends
 * permanently. Access via {@link Scene.audio}.
 *
 * Delegates entirely to `app.audio` — no second audio graph, just tracking of
 * what this facade started so it can stop it on teardown (and, for capable
 * voices, pause/resume it across retention suspension). Playback requested
 * while the scope is `Preparing` is queued and started once the scope
 * activates — see {@link PendingVoice}.
 */
export class SceneAudio implements Destroyable {
  private readonly _tracked = new Map<Voice, SceneAvailability>();
  private readonly _pending = new Set<PendingVoice>();
  private _suspended: Set<Voice & Pausable> | null = null;
  private _frozenByPause: Set<Voice & Pausable> | null = null;
  private _thawedByPause: Set<Voice & Pausable> | null = null;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  /**
   * Play `source` through the application audio manager and track the
   * resulting {@link Voice} for scene-lifetime cleanup. While the scope is
   * `Preparing`, `Ready`, or `Suspended`, returns a {@link PendingVoice}
   * stand-in immediately and defers the real `app.audio.play(...)` call
   * until (re)activation — including a call made while already `Suspended`
   * (a new registration while dormant must buffer, not
   * play for real, regardless of how the scope became dormant). While
   * `Destroying`/`Destroyed`, rejects instead: a dev build throws a clear
   * lifecycle error (playback requested during permanent teardown can
   * never be scheduled); a production build returns an inert, already-
   * `ended` stand-in rather than crashing a teardown path.
   */
  public play(source: Playable, options?: SceneAudioPlayOptions): Voice {
    const state = this._getState();

    if (state === SceneState.Destroying || state === SceneState.Destroyed) {
      if (__DEV__) {
        throw new Error(
          'SceneAudio.play() was called while the owning scene is being destroyed (state is "destroying"/"destroyed") — playback requested during permanent teardown can never be scheduled.',
        );
      }

      return this._createDeadVoice(options ?? {});
    }

    if (state !== SceneState.Active) {
      const pending = new PendingVoice(() => this._app.audio.play(source, options ?? {}), options ?? {});

      this._pending.add(pending);
      this._tracked.set(pending, pending.when);

      return pending;
    }

    return this.add(this._app.audio.play(source, options), options);
  }

  /**
   * Production-build fallback for {@link SceneAudio.play} called during
   * `Destroying`/`Destroyed`: an already-cancelled {@link PendingVoice}
   * whose `_createReal` callback is never invoked (a cancelled voice is
   * never flushed) — inert, but Voice-shaped, so calling code that doesn't
   * dev-guard its `play()` calls doesn't crash mid-teardown.
   */
  private _createDeadVoice(options: SceneAudioPlayOptions): Voice {
    const dead = new PendingVoice(() => {
      throw new Error('SceneAudio: a dead voice (created during Destroying/Destroyed) must never be flushed.');
    }, options);

    dead.stop();

    return dead;
  }

  /** Track an already-created {@link Voice} (e.g. from `app.audio.play(...)`) for scene-lifetime cleanup. Returns it unchanged. */
  public add(voice: Voice, options?: SceneAudioTrackOptions): Voice {
    this._tracked.set(voice, options?.when ?? SceneAvailability.Always);

    return voice;
  }

  /**
   * Start every voice queued by {@link SceneAudio.play} while the scope was
   * `Preparing`. Called once, by {@link SceneScope.activate}. Swaps each
   * flushed {@link PendingVoice} wrapper in `_tracked` for the real `Voice`
   * it created — carrying its `when` policy across — so
   * `suspend()`/`restore()`/`pause()`/`resume()`/`destroy()` see the
   * capability-bearing voice. The caller's own reference stays the wrapper,
   * which forwards to the real voice transparently.
   * @internal
   */
  public _flushPending(): void {
    for (const pending of this._pending) {
      const real = pending._flush();

      if (real !== null && this._tracked.delete(pending)) {
        this._tracked.set(real, pending.when);
      }
    }

    this._pending.clear();
  }

  /**
   * Pause every tracked, currently-playing {@link Pausable} voice, recording
   * exactly that set so {@link SceneAudio.restore} can reinstate it. Reserved
   * for retention suspension — voices without pause support ({@link InputVoice},
   * {@link NoopVoice}) are left playing, matching the definition's "suspended
   * where supported" contract.
   * @internal
   */
  public suspend(): void {
    const playing = new Set<Voice & Pausable>();

    for (const voice of this._tracked.keys()) {
      if (!voice.ended && isPausable(voice) && !voice.paused) {
        voice.pause();
        playing.add(voice);
      }
    }

    this._suspended = playing;
  }

  /** Restore exactly the voices paused by {@link SceneAudio.suspend}. @internal */
  public restore(): void {
    if (this._suspended === null) {
      return;
    }

    for (const voice of this._suspended) {
      if (!voice.ended) {
        voice.resume();
      }
    }

    this._suspended = null;
  }

  /**
   * Apply the `when` pause policy for every tracked, `Pausable` voice:
   * `'active'` voices currently playing are paused; `'paused'` voices
   * currently paused are woken up early. Called by {@link SceneScope.pause}.
   * Does not touch a `'paused'` voice that happens to already be playing —
   * see {@link SceneAudioPlayOptions.when}, a documented, accepted
   * limitation — or any non-`Pausable` voice.
   * @internal
   */
  public pause(): void {
    const frozen = new Set<Voice & Pausable>();
    const thawed = new Set<Voice & Pausable>();

    for (const [voice, when] of this._tracked) {
      if (!isPausable(voice) || voice.ended) {
        continue;
      }

      if (when === SceneAvailability.Active && !voice.paused) {
        voice.pause();
        frozen.add(voice);
      } else if (when === SceneAvailability.Paused && voice.paused) {
        voice.resume();
        thawed.add(voice);
      }
    }

    this._frozenByPause = frozen;
    this._thawedByPause = thawed;
  }

  /**
   * Undo {@link SceneAudio.pause}: resumes everything it froze, re-freezes
   * everything it woke up early — each only if still in the state this
   * facade left it in, so a voice the caller paused/resumed manually in
   * between is left alone. Called by {@link SceneScope.resume}.
   * @internal
   */
  public resume(): void {
    if (this._frozenByPause !== null) {
      for (const voice of this._frozenByPause) {
        if (!voice.ended && voice.paused) {
          voice.resume();
        }
      }

      this._frozenByPause = null;
    }

    if (this._thawedByPause !== null) {
      for (const voice of this._thawedByPause) {
        if (!voice.ended && !voice.paused) {
          voice.pause();
        }
      }

      this._thawedByPause = null;
    }
  }

  public destroy(): void {
    for (const voice of this._tracked.keys()) {
      voice.stop();
    }

    this._tracked.clear();
    this._suspended = null;
    this._frozenByPause = null;
    this._thawedByPause = null;
    this._pending.clear();
  }
}
