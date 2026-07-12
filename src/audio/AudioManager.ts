import { Signal } from '#core/Signal';
import type { System } from '#core/System';
import type { Time } from '#core/Time';

import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';
import { AudioBus } from './AudioBus';
import type { AudioInput } from './AudioInput';
import { AudioListener } from './AudioListener';
import type { SpatialVoice } from './BaseVoice';
import { InputVoice } from './InputVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import { createSpatialSmoothingSettings, type SpatialSmoothingSettings } from './spatial-smoothing';

/**
 * Per-{@link Application} owner of the audio mix: three pre-configured
 * {@link AudioBus} instances (`master` ← `music` + `sound`), a single
 * {@link AudioListener} for spatial audio, and a registry of any extra busses
 * the user constructs.
 *
 * The `AudioContext` is shared process-wide, but each Application owns its own
 * bus subtree, so multiple Applications mix independently. Access it via
 * `app.audio`. Drives the per-frame `_tick()` on the listener and every spatial
 * voice, and propagates visibility-driven mute when
 * {@link AudioManager.muteOnHidden} is enabled.
 */
export class AudioManager implements System {
  /** App-systems tick band — audio after interaction. @internal */
  public readonly order = 300;
  public readonly master: AudioBus;
  public readonly music: AudioBus;
  public readonly sound: AudioBus;
  public readonly listener: AudioListener;
  /**
   * Tunable smoothing applied to per-frame panner/listener position updates,
   * shared by the {@link AudioListener} and every spatial voice. Adjust
   * `smoothing` (the `setTargetAtTime` time constant) or `teleportThreshold`
   * (the snap-instead-of-ramp jump distance) to trade responsiveness against
   * zipper-noise suppression (AU4). Reachable as `app.audio.spatial`.
   */
  public readonly spatial: SpatialSmoothingSettings = createSpatialSmoothingSettings();
  /**
   * Fires once when the AudioContext transitions to "running" — i.e. the first
   * user gesture unlocks audio under the browser's autoplay policy. Check
   * {@link AudioManager.locked} for the current state; sounds played while
   * locked are deferred and start automatically on that gesture.
   */
  public readonly onUnlock = new Signal();

  private readonly _registered = new Map<string, AudioBus>();
  private readonly _spatial = new Set<SpatialVoice>();
  private _muteOnHidden = false;

  public constructor() {
    this.master = new AudioBus('master', { parent: null });
    this.music = new AudioBus('music', { parent: this.master });
    this.sound = new AudioBus('sound', { parent: this.master });
    this.listener = new AudioListener(this.spatial);

    // Built-ins are also lookup-able via getBus.
    this._registered.set('master', this.master);
    this._registered.set('music', this.music);
    this._registered.set('sound', this.sound);

    if (isAudioContextReady()) {
      // The shared context is already running — this manager was constructed
      // after the one-shot ready signal fired (e.g. a second Application in
      // the same process; the buses above would otherwise consume the signal
      // before this handler registers). Dispatch the unlock on a microtask so
      // subscribers registered right after construction still observe it.
      queueMicrotask(() => this.onUnlock.dispatch());
    } else {
      onAudioContextReady.add((): void => {
        this.onUnlock.dispatch();
      });
    }
  }

  /**
   * When `true`, the master bus is muted while `document.hidden` is true.
   * Wired to {@link Application.onVisibilityChange} via
   * {@link AudioManager._applyVisibility}; the application calls that
   * hook automatically — set this flag to opt in to the behavior.
   */
  public get muteOnHidden(): boolean {
    return this._muteOnHidden;
  }

  public set muteOnHidden(value: boolean) {
    this._muteOnHidden = value;
    // Wiring to app.onVisibilityChange happens externally — the
    // Application is responsible for calling _applyVisibility() when
    // visibility changes.
  }

  /**
   * `true` while audio is blocked by the browser's autoplay policy — no user
   * gesture has resumed the AudioContext yet. Voices played while locked are
   * deferred (streams) or skipped (generators) until that gesture.
   */
  public get locked(): boolean {
    return !isAudioContextReady();
  }

  /**
   * Play a {@link Playable} asset and return a {@link Voice} handle.
   *
   * Each call creates an independent playback instance. Call `play()` again
   * to start another concurrent voice. The returned Voice lets you control
   * this specific instance (`stop()`, `volume`, `fade()`, capabilities).
   *
   * @example
   * ```ts
   * const voice = app.audio.play(shootSfx);
   * // Later:
   * voice.stop();
   * ```
   *
   * @param source - Any {@link Playable} asset (Sound, AudioStream, AudioGenerator).
   * @param options - Per-play overrides (bus, volume, loop, playbackRate, detune, time, muted).
   * @returns A {@link Voice} handle for the new instance.
   */
  public play(source: Playable, options?: PlayOptions): Voice {
    return source._createVoice(this, options ?? {});
  }

  /**
   * Open a live {@link AudioInput} (microphone / WebRTC stream) and return an
   * {@link InputVoice}. The input is analysis-only by default (not audible) —
   * tap it with an analyser, route it to a bus to monitor, or record it.
   *
   * @example
   * ```ts
   * const mic = await AudioInput.open();
   * const input = app.audio.open(mic);
   * input.analyse(analyser);
   * ```
   */
  public open(input: AudioInput): InputVoice {
    const audioContext = getAudioContext();
    const sourceNode = audioContext.createMediaStreamSource(input.stream);
    const output = audioContext.createGain();

    return new InputVoice({
      audioContext,
      output,
      bus: this.sound,
      manager: this,
      volume: 1,
      sourceNode,
      stream: input.stream,
    });
  }

  /** Called once per frame from Application.update(). The frame delta is unused here (hence `_delta`); present for {@link System} contract compliance. */
  public update(_delta: Time): void {
    this.listener._tick();
    // Tick spatial voices and prune ended ones.
    for (const voice of this._spatial) {
      if (voice.ended) {
        this._spatial.delete(voice);
        continue;
      }
      voice._tickSpatial();
    }
  }

  /**
   * Internal: register a spatial voice for per-frame position updates. Called by
   * a {@link Voice} the first time it is spatialized (position set or follow).
   */
  public _registerSpatial(voice: SpatialVoice): void {
    this._spatial.add(voice);
  }

  /** Internal: called by Application when visibility changes. */
  public _applyVisibility(visible: boolean): void {
    if (this._muteOnHidden) {
      this.master.muted = !visible;
    }
  }

  /**
   * Register a user-constructed {@link AudioBus} so it can be looked up by
   * name via {@link AudioManager.getBus}. Throws if a bus with the same
   * name is already registered.
   */
  public registerBus(bus: AudioBus): this {
    if (this._registered.has(bus.name)) {
      throw new Error(`Audio bus "${bus.name}" is already registered.`);
    }
    this._registered.set(bus.name, bus);
    return this;
  }

  /**
   * Unregister and {@link AudioBus.destroy} a previously registered bus.
   * Throws if you attempt to unregister one of the three built-ins
   * (`master`, `music`, `sound`). No-op if the bus is unknown.
   */
  public unregisterBus(bus: AudioBus): this {
    if (bus === this.master || bus === this.music || bus === this.sound) {
      throw new Error(`Cannot unregister built-in bus "${bus.name}".`);
    }
    const existing = this._registered.get(bus.name);
    if (existing !== bus) {
      // Either not registered, or different instance with same name.
      return this;
    }
    this._registered.delete(bus.name);
    bus.destroy();
    return this;
  }

  /** Look up a bus by name. Throws if the name is not registered. */
  public getBus(name: string): AudioBus {
    const bus = this._registered.get(name);
    if (!bus) {
      throw new Error(`Audio bus "${name}" is not registered.`);
    }
    return bus;
  }

  /** `true` when a bus with `name` has been registered. */
  public hasBus(name: string): boolean {
    return this._registered.has(name);
  }

  public destroy(): void {
    this.listener.destroy();
    this._spatial.clear();
    for (const bus of this._registered.values()) {
      // Note: destroying built-ins too — AudioManager is destroyed only when app shuts down.
      bus.destroy();
    }
    this._registered.clear();
  }
}
