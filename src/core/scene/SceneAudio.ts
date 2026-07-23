import { getAudioContext } from '#audio/audio-context';
import type { AudioBus } from '#audio/AudioBus';
import type { AudioEffect } from '#audio/AudioEffect';
import type { Pausable, Playable, PlayOptions, Voice } from '#audio/Playable';
import type { Application } from '#core/Application';
import { SceneState } from '#core/SceneState';
import { Signal } from '#core/Signal';
import type { Destroyable } from '#core/types';

const isPausable = (voice: Voice): voice is Voice & Pausable => 'pause' in voice && 'resume' in voice;

/**
 * Stand-in {@link Voice} returned by {@link SceneAudio.play} while the owning
 * scope is still `Preparing` (definition §7.8). Buffers `volume`/`bus`/effect
 * writes and replays them onto the real voice once {@link PendingVoice._flush}
 * runs at activation; `stop()` before flush cancels playback entirely — the
 * real voice is never created. Narrower than a real `Voice`: capability
 * mixins (`Pausable`, `Seekable`, …) are unavailable until flush, and reading
 * `bus` before flush returns `undefined` (despite the type) unless an
 * explicit `options.bus` override was given — the manager's default bus
 * isn't resolvable until the real voice exists. A documented limitation of
 * Preparing-phase playback, not a general `Voice` capability.
 * @internal
 */
class PendingVoice implements Voice {
  private _real: Voice | null = null;
  private _cancelled = false;
  private _volume: number;
  private _bus: AudioBus | undefined;
  private readonly _pendingEffects: AudioEffect[] = [];
  private readonly _dummyOutput: AudioNode;
  public readonly onEnd = new Signal();

  public constructor(
    private readonly _createReal: () => Voice,
    options: PlayOptions,
  ) {
    this._volume = options.volume ?? 1;
    this._bus = options.bus;
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

  /** Start real playback. No-op if already flushed or cancelled via {@link PendingVoice.stop}. */
  public _flush(): void {
    if (this._cancelled || this._real !== null) {
      return;
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
    real.onEnd.add((): void => {
      this.onEnd.dispatch();
    });
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
 * activates (definition §7.8) — see {@link PendingVoice}.
 */
export class SceneAudio implements Destroyable {
  private readonly _tracked = new Set<Voice>();
  private readonly _pending = new Set<PendingVoice>();
  private _suspended: Set<Voice & Pausable> | null = null;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  /**
   * Play `source` through the application audio manager and track the
   * resulting {@link Voice} for scene-lifetime cleanup. While the scope is
   * `Preparing`, returns a {@link PendingVoice} stand-in immediately and
   * defers the real `app.audio.play(...)` call until activation.
   */
  public play(source: Playable, options?: PlayOptions): Voice {
    if (this._getState() === SceneState.Preparing) {
      const pending = new PendingVoice(() => this._app.audio.play(source, options ?? {}), options ?? {});

      this._pending.add(pending);
      this._tracked.add(pending);

      return pending;
    }

    return this.add(this._app.audio.play(source, options));
  }

  /** Track an already-created {@link Voice} (e.g. from `app.audio.play(...)`) for scene-lifetime cleanup. Returns it unchanged. */
  public add(voice: Voice): Voice {
    this._tracked.add(voice);

    return voice;
  }

  /**
   * Start every voice queued by {@link SceneAudio.play} while the scope was
   * `Preparing`. Called once, by {@link SceneScope.activate}.
   * @internal
   */
  public _flushPending(): void {
    for (const pending of this._pending) {
      pending._flush();
    }

    this._pending.clear();
  }

  /**
   * Pause every tracked, currently-playing {@link Pausable} voice, recording
   * exactly that set so {@link SceneAudio.resume} can restore it. Reserved
   * for retention suspension — voices without pause support are left
   * playing, matching the definition's "suspended where supported" contract.
   * @internal
   */
  public suspend(): void {
    const playing = new Set<Voice & Pausable>();

    for (const voice of this._tracked) {
      if (!voice.ended && isPausable(voice) && !voice.paused) {
        voice.pause();
        playing.add(voice);
      }
    }

    this._suspended = playing;
  }

  /** Resume exactly the voices paused by {@link SceneAudio.suspend}. @internal */
  public resume(): void {
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

  public destroy(): void {
    for (const voice of this._tracked) {
      voice.stop();
    }

    this._tracked.clear();
    this._suspended = null;
    this._pending.clear();
  }
}
