import type { AudioBus } from '#audio/AudioBus';
import { getAudioContext } from '#audio/audioContext';
import type { AudioEffect } from '#audio/AudioEffect';
import type { AudioGenerator } from '#audio/AudioGenerator';
import { AudioSend } from '#audio/AudioSend';
import type { AudioStream } from '#audio/AudioStream';
import type {
  DistanceModel,
  Loopable,
  Pausable,
  Playable,
  PlayOptions,
  RatePitched,
  Seekable,
  Spatializable,
  SpatialPoint,
  Voice,
  VoiceProfile,
} from '#audio/Playable';
import type { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneState } from '#core/scene/SceneState';
import type { SceneNode } from '#core/SceneNode';
import { Signal } from '#core/Signal';
import type { Destroyable } from '#core/types';
import { type Seconds, seconds } from '#core/units';
import { Vector } from '#math/Vector';

const isPausable = (voice: Voice): voice is Voice & Pausable => 'pause' in voice && 'resume' in voice;

/** Options accepted by {@link SceneAudio.play}, extending the base {@link PlayOptions}. */
export interface SceneAudioPlayOptions extends PlayOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely - today's behavior.
   * `'active'` freezes the moment the scene pauses, resumes when it resumes.
   * `'paused'` is the mirror image: plays only while the scene is paused.
   * Has no effect on a {@link Voice} that doesn't support {@link Pausable}.
   *
   * Applied only at the scene's pause/resume transitions, not re-checked at
   * creation time - a voice started while the scene is already paused plays
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
 * flush. `position`/`velocity` are held separately - they own a {@link Vector}
 * that has to be released - and `follow` is a call, not a value.
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
  elevation?: number;
  elevationVelocity?: number;
  occlusion?: number;
}

/**
 * Copy `value` into `target`, allocating or releasing the {@link Vector} as
 * needed. Mirrors how `BaseVoice` stores its own spatial points: the caller's
 * object is never retained.
 */
const copyPoint = (target: Vector | null, value: Vector | SpatialPoint | null): Vector | null => {
  if (value === null) {
    target?.destroy();

    return null;
  }

  if (target === null) {
    return new Vector(value.x, value.y);
  }

  target.set(value.x, value.y);

  return target;
};

/** The capability members a flushed real voice may or may not carry. */
type CapabilityVoice = Voice & Partial<Seekable & Pausable & Loopable & RatePitched>;

/**
 * Stand-in {@link Voice} returned by {@link SceneAudio.play} while the owning
 * scope is dormant. Buffers `volume`/`bus`/effect, a pending
 * {@link PendingVoice.fade}, {@link Spatializable} writes and capability
 * writes, and replays them onto the real voice once {@link PendingVoice._flush}
 * runs at activation; `stop()` before flush cancels playback entirely - the
 * real voice is never created.
 *
 * The capability members (`Seekable`, `Pausable`, `Loopable`, `RatePitched`)
 * are installed at construction from the source's {@link VoiceProfile}, so a
 * `'seek' in voice` check answers the same before and after flush, and after
 * flush every member forwards to the real voice. A real voice that came back
 * without a capability (an ended placeholder) leaves the member inert.
 * @internal
 */
class PendingVoice implements Voice {
  private static readonly _seekableMembers: PropertyDescriptorMap = {
    time: {
      get(this: PendingVoice): number {
        return this._getTime();
      },
      set(this: PendingVoice, value: number): void {
        this._seek(value);
      },
    },
    duration: {
      get(this: PendingVoice): number {
        return this._real === null ? (this._describe().duration ?? 0) : (this._real.duration ?? 0);
      },
    },
    seek: {
      value(this: PendingVoice, t: number): void {
        this._seek(t);
      },
    },
  };

  private static readonly _pausableMembers: PropertyDescriptorMap = {
    paused: {
      get(this: PendingVoice): boolean {
        return this._real === null ? this._paused : (this._real.paused ?? false);
      },
    },
    pause: {
      value(this: PendingVoice): void {
        this._setPaused(true);
      },
    },
    resume: {
      value(this: PendingVoice): void {
        this._setPaused(false);
      },
    },
  };

  private static readonly _loopableMembers: PropertyDescriptorMap = {
    loop: {
      get(this: PendingVoice): boolean {
        return this._real === null ? (this._loop ?? this._describe().loop ?? false) : (this._real.loop ?? false);
      },
      set(this: PendingVoice, value: boolean): void {
        const real = this._real;

        if (real === null) {
          this._loop = value;
        } else if ('loop' in real) {
          real.loop = value;
        }
      },
    },
  };

  private static readonly _ratePitchedMembers: PropertyDescriptorMap = {
    playbackRate: {
      get(this: PendingVoice): number {
        return this._real === null ? (this._playbackRate ?? this._describe().playbackRate ?? 1) : (this._real.playbackRate ?? 1);
      },
      set(this: PendingVoice, value: number): void {
        const real = this._real;

        if (real === null) {
          this._playbackRate = value;
        } else if ('playbackRate' in real) {
          real.playbackRate = value;
        }
      },
    },
    detune: {
      get(this: PendingVoice): number {
        return this._real === null ? (this._detune ?? this._describe().detune ?? 0) : (this._real.detune ?? 0);
      },
      set(this: PendingVoice, value: number): void {
        const real = this._real;

        if (real === null) {
          this._detune = value;
        } else if ('detune' in real) {
          real.detune = value;
        }
      },
    },
  };

  private _real: CapabilityVoice | null = null;
  private _cancelled = false;
  private _volume: number;
  private _bus: AudioBus | undefined;
  /** Requested start offset from a {@link Seekable} write before flush; handed to the real voice as `PlayOptions.time`. */
  private _startTime: number | undefined;
  /** Pause requested before flush: the real voice is paused in the same task it is created in, before any audio is rendered. */
  private _paused = false;
  private _loop: boolean | undefined;
  private _playbackRate: number | undefined;
  private _detune: number | undefined;
  private readonly _pendingEffects: AudioEffect[] = [];
  /**
   * Sends opened before the real voice existed. Each is wired to
   * {@link PendingVoice._dummyOutput} and re-pointed at the real output on flush,
   * so the handle the caller already holds stays valid.
   */
  private readonly _sendList: AudioSend[] = [];
  private readonly _dummyOutput: AudioNode;
  /** Volume a buffered {@link PendingVoice.fade} ramps from, or `null` when no fade is pending. */
  private _fadeFrom: number | null = null;
  private _fadeDuration: Seconds = seconds(0);
  private readonly _spatial: BufferedSpatialWrites = {};
  private _followTarget: SceneNode | null | undefined;
  private _position: Vector | null = null;
  private _positionWritten = false;
  private _velocity: Vector | null = null;
  private _velocityWritten = false;
  public readonly onEnd = new Signal();
  /** The `when` policy this voice was created with - carried across to the real `Voice` at flush. */
  public readonly when: SceneAvailability;

  /**
   * @param _createReal - Starts the real voice from the given options.
   * @param _options - The options of the originating play call.
   * @param _describe - Reports the source's {@link VoiceProfile}. Read once here to
   * fix the capability surface, and again for every pre-flush read so source
   * defaults changed before activation are reported as the real voice will see them.
   */
  public constructor(
    private readonly _createReal: (options: PlayOptions) => Voice,
    private readonly _options: SceneAudioPlayOptions,
    private readonly _describe: () => VoiceProfile,
  ) {
    this._volume = _options.volume ?? 1;
    this._bus = _options.bus;
    this.when = _options.when ?? SceneAvailability.Always;
    this._dummyOutput = getAudioContext().createGain();

    const profile = _describe();

    if (profile.duration !== null) {
      Object.defineProperties(this, PendingVoice._seekableMembers);
    }

    if (profile.pausable) {
      Object.defineProperties(this, PendingVoice._pausableMembers);
    }

    if (profile.loop !== null) {
      Object.defineProperties(this, PendingVoice._loopableMembers);
    }

    if (profile.playbackRate !== null) {
      Object.defineProperties(this, PendingVoice._ratePitchedMembers);
    }
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
    this._fadeFrom = null;

    if (this._real) {
      this._real.volume = value;
    }
  }

  public get bus(): AudioBus {
    return this._real?.bus ?? this._bus ?? this._describe().bus;
  }

  public set bus(value: AudioBus) {
    this._bus = value;

    if (this._real) {
      this._real.bus = value;
    }
  }

  /**
   * Before flush there is nothing to ramp, so the request is buffered rather
   * than collapsed to its target: the real voice starts at the volume that was
   * in effect when this was called and runs the ramp itself. A later `volume`
   * write supersedes the buffered ramp; a later `fade` keeps the original
   * starting volume and replaces the target and duration.
   */
  public fade(to: number, duration: Seconds): void {
    if (this._real) {
      this._real.fade(to, duration);

      return;
    }

    this._fadeFrom ??= this._volume;
    this._fadeDuration = duration;
    this._volume = to;
  }

  public stop(fade?: Seconds): void {
    if (this._real) {
      this._real.stop(fade);

      return;
    }

    if (!this._cancelled) {
      this._cancelled = true;
      this._releasePoints();
      this.onEnd.dispatch();
    }
  }

  private _getTime(): number {
    if (this._real !== null) {
      return this._real.time ?? 0;
    }

    return Math.max(0, this._startTime ?? this._options.time ?? 0);
  }

  private _seek(t: number): void {
    const real = this._real;

    if (real !== null) {
      real.seek?.(t);
    } else if (!this._cancelled) {
      this._startTime = t;
    }
  }

  private _setPaused(paused: boolean): void {
    const real = this._real;

    if (real === null) {
      if (!this._cancelled) {
        this._paused = paused;
      }
    } else if (paused) {
      real.pause?.();
    } else {
      real.resume?.();
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

  // Spatializable - buffered like volume/bus above. Only what the caller
  // actually wrote is replayed at flush: the real voice is created from the
  // same PlayOptions, so blindly writing defaults would undo the spatial
  // values the play call already carried.

  public get position(): Vector | null {
    return this._real?.position ?? this._position;
  }

  public set position(value: Vector | SpatialPoint | null) {
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

  public get elevation(): number {
    return this._real?.elevation ?? this._spatial.elevation ?? 0;
  }

  public set elevation(value: number) {
    this._spatial.elevation = value;

    if (this._real) {
      this._real.elevation = value;
    }
  }

  public get elevationVelocity(): number {
    return this._real?.elevationVelocity ?? this._spatial.elevationVelocity ?? 0;
  }

  public set elevationVelocity(value: number) {
    this._spatial.elevationVelocity = value;

    if (this._real) {
      this._real.elevationVelocity = value;
    }
  }

  public get occlusion(): number {
    return this._real?.occlusion ?? this._spatial.occlusion ?? 0;
  }

  public set occlusion(value: number) {
    this._spatial.occlusion = value;

    if (this._real) {
      this._real.occlusion = value;
    }
  }

  public get sends(): readonly AudioSend[] {
    return this._real?.sends ?? this._sendList;
  }

  public addSend(bus: AudioBus, level = 1): AudioSend {
    if (this._real) {
      return this._real.addSend(bus, level);
    }

    // Wired to the placeholder output, which nothing feeds, so the send is silent
    // until flush re-points it at the real voice.
    const send = new AudioSend(getAudioContext(), this._dummyOutput, bus, level);

    this._sendList.push(send);

    return send;
  }

  /** @internal */
  public _adoptSend(send: AudioSend): void {
    if (this._real) {
      this._real._adoptSend(send);

      return;
    }

    send._retarget(this._dummyOutput);
    this._sendList.push(send);
  }

  public removeSend(send: AudioSend): this {
    if (this._real) {
      this._real.removeSend(send);

      return this;
    }

    const index = this._sendList.indexOf(send);

    if (index !== -1) {
      this._sendList.splice(index, 1);
      send.destroy();
    }

    return this;
  }

  public get velocity(): Vector | null {
    return this._real?.velocity ?? this._velocity;
  }

  public set velocity(value: Vector | SpatialPoint | null) {
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
   *
   * A buffered seek becomes the start offset rather than a seek after start, so
   * a buffer source is not started twice. A real voice that is already ended
   * when it comes back (the play call was skipped, e.g. audio still locked)
   * ends this voice too: the caller may have subscribed to `onEnd` while the
   * voice still looked live, and a born-ended voice never dispatches.
   */
  public _flush(): Voice | null {
    if (this._cancelled || this._real !== null) {
      return null;
    }

    let options: PlayOptions = this._options;

    if (this._startTime !== undefined) {
      options = { ...options, time: this._startTime };
    }

    const real: CapabilityVoice = this._createReal(options);
    let endForwarded = false;

    this._real = real;

    if (this._fadeFrom === null) {
      real.volume = this._volume;
    } else {
      real.volume = this._fadeFrom;
      real.fade(this._volume, this._fadeDuration);
      this._fadeFrom = null;
    }

    if (this._bus !== undefined) {
      real.bus = this._bus;
    }

    for (const effect of this._pendingEffects) {
      real.addEffect(effect);
    }

    this._pendingEffects.length = 0;

    // Handed over rather than re-created: the caller already holds these objects.
    for (const send of this._sendList) {
      real._adoptSend(send);
    }

    this._sendList.length = 0;
    this._replaySpatial(real);
    real.onEnd.add((): void => {
      endForwarded = true;
      this.onEnd.dispatch();
    });
    this._replayCapabilities(real);

    if (real.ended && !endForwarded) {
      this.onEnd.dispatch();
    }

    return real;
  }

  /**
   * Replay buffered capability writes. Pause goes last: the voice has to exist
   * in its final configuration before it is frozen, and pausing in the same
   * task it was started in means no audio is rendered in between.
   */
  private _replayCapabilities(real: CapabilityVoice): void {
    if (this._loop !== undefined && 'loop' in real) {
      real.loop = this._loop;
    }

    if (this._playbackRate !== undefined && 'playbackRate' in real) {
      real.playbackRate = this._playbackRate;
    }

    if (this._detune !== undefined && 'detune' in real) {
      real.detune = this._detune;
    }

    if (this._paused) {
      real.pause?.();
    }
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

    if (spatial.elevation !== undefined) {
      real.elevation = spatial.elevation;
    }

    if (spatial.elevationVelocity !== undefined) {
      real.elevationVelocity = spatial.elevationVelocity;
    }

    if (spatial.occlusion !== undefined) {
      real.occlusion = spatial.occlusion;
    }

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
 * Delegates entirely to `app.audio` - no second audio graph, just tracking of
 * what this facade started, so it can stop it on teardown and steer it across
 * the scene's pause and retention transitions.
 *
 * ## Deferred playback
 *
 * {@link SceneAudio.play} only reaches `app.audio` while the scene is active.
 * Called before activation, or while the scene is retained, it returns a
 * stand-in voice immediately and starts real playback when the scene next
 * becomes active. The stand-in stays the caller's handle for the whole life of
 * the playback: before activation it buffers `volume`, `bus`, effects, sends,
 * `fade` and the {@link Spatializable} surface, all replayed in order onto the
 * real voice; afterwards it forwards everything to the real voice.
 *
 * `bus` reports the bus the voice will route into from the moment `play()`
 * returns. The stand-in carries the capability mixins of the voice its source
 * starts - {@link Sound} and {@link AudioStream}: `Seekable`, `Pausable`,
 * `Loopable`, `RatePitched`; {@link AudioGenerator}: `Pausable`, `RatePitched`;
 * any other {@link Playable}: none - so a `'seek' in voice` check answers the
 * same before and after activation. Requests made before activation are
 * applied when playback starts:
 *
 * - `stop()` cancels playback outright; the real voice is never created.
 * - `pause()` starts the real voice paused; `resume()` before activation
 *   withdraws the request.
 * - `seek(t)` (or a `time` write) becomes the start offset.
 * - `loop`, `playbackRate` and `detune` writes are applied to the new voice.
 *
 * Activation starts playback through `app.audio` whether or not the browser has
 * unlocked audio yet, so the {@link AudioSystem.locked} rules apply exactly as
 * for a direct play call: a {@link Sound} or {@link AudioGenerator} is skipped
 * and the stand-in ends (dispatching `onEnd`), an {@link AudioStream} waits for
 * the unlock gesture.
 *
 * ## Pause and retention
 *
 * Two independent transitions touch tracked voices, and both act only on
 * voices that support pausing - anything else keeps playing:
 *
 * - **Scene pause** ({@link SceneDirector.pause}/{@link SceneDirector.resume})
 *   applies each voice's {@link SceneAudioPlayOptions.when} policy: `'active'`
 *   voices are paused, `'paused'` voices are started, `'always'` voices are
 *   left alone. Resuming reverses exactly what the pause did, and skips a voice
 *   the caller has since paused or resumed itself.
 * - **Retention** (a scene kept alive while another runs) pauses every tracked
 *   voice that is currently playing, whatever its `when` policy, and restores
 *   exactly that set. A retained scene's paused flag survives, so a scene
 *   retained while paused comes back paused.
 *
 * Permanent teardown stops every tracked voice, deferred ones included, and
 * releases the tracking. A play call made during teardown is refused: a
 * development build throws, a production build returns an already-ended voice.
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
   * Play `source` through the application audio system and track the
   * resulting {@link Voice} for scene-lifetime cleanup. While the scope is
   * `Preparing`, `Ready`, or `Suspended`, returns a stand-in voice
   * immediately and defers the real `app.audio.play(...)` call until
   * (re)activation - including a call made while already `Suspended` (a new
   * registration while dormant must buffer, not play for real, regardless of
   * how the scope became dormant). See "Deferred playback" above for what the
   * stand-in reports and how requests made before activation are applied.
   * While `Destroying`/`Destroyed`, rejects instead: a dev build throws a
   * clear lifecycle error (playback requested during permanent teardown can
   * never be scheduled); a production build returns an inert, already-
   * `ended` stand-in rather than crashing a teardown path.
   *
   * The return type follows {@link AudioSystem.play}: an {@link AudioStream}
   * voice always carries its capabilities, a {@link Sound} or
   * {@link AudioGenerator} voice is narrowed with a capability check because
   * the play call may yield an already-ended voice without them.
   */
  public play(source: Sound, options?: SceneAudioPlayOptions): Voice | (Voice & Seekable & Pausable & Loopable & RatePitched);
  public play(source: AudioStream, options?: SceneAudioPlayOptions): Voice & Seekable & Pausable & Loopable & RatePitched;
  public play(source: AudioGenerator, options?: SceneAudioPlayOptions): Voice | (Voice & Pausable & RatePitched);
  public play(source: Playable, options?: SceneAudioPlayOptions): Voice;
  public play(source: Playable, options: SceneAudioPlayOptions = {}): Voice {
    const state = this._getState();

    if (state === SceneState.Destroying || state === SceneState.Destroyed) {
      if (__DEV__) {
        throw new Error(
          'SceneAudio.play() was called while the owning scene is being destroyed (state is "destroying"/"destroyed") — playback requested during permanent teardown can never be scheduled.',
        );
      }

      return this._createDeadVoice(source, options);
    }

    if (state !== SceneState.Active) {
      const pending = new PendingVoice(
        startOptions => this._app.audio.play(source, startOptions),
        options,
        () => this._profile(source, options),
      );

      this._pending.add(pending);
      this._tracked.set(pending, pending.when);

      return pending;
    }

    return this.add(this._app.audio.play(source, options), options);
  }

  /**
   * The source's own {@link VoiceProfile}, or the base surface on the sound bus
   * for a {@link Playable} that does not describe its voice.
   */
  private _profile(source: Playable, options: SceneAudioPlayOptions): VoiceProfile {
    const system = this._app.audio;

    return (
      source._profileVoice?.(system, options) ?? {
        bus: options.bus ?? system.sound,
        pausable: false,
        duration: null,
        loop: null,
        playbackRate: null,
        detune: null,
      }
    );
  }

  /**
   * Production-build fallback for {@link SceneAudio.play} called during
   * `Destroying`/`Destroyed`: an already-cancelled {@link PendingVoice}
   * whose `_createReal` callback is never invoked (a cancelled voice is
   * never flushed) - inert, but shaped like the voice the source would have
   * started, so calling code that doesn't dev-guard its `play()` calls doesn't
   * crash mid-teardown.
   */
  private _createDeadVoice(source: Playable, options: SceneAudioPlayOptions): Voice {
    const dead = new PendingVoice(
      () => {
        throw new Error('SceneAudio: a dead voice (created during Destroying/Destroyed) must never be flushed.');
      },
      options,
      () => this._profile(source, options),
    );

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
   * it created - carrying its `when` policy across - so
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
   * for retention suspension - voices without pause support ({@link InputVoice},
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
   * Does not touch a `'paused'` voice that happens to already be playing -
   * see {@link SceneAudioPlayOptions.when}, a documented, accepted
   * limitation - or any non-`Pausable` voice.
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
   * everything it woke up early - each only if still in the state this
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
