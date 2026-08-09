import { logger } from '#core/logging';
import { Signal } from '#core/Signal';
import type { Time } from '#core/Time';

import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';
import { AudioBus } from './AudioBus';
import type { AudioInput } from './AudioInput';
import { AudioListener } from './AudioListener';
import type { SpatialVoice } from './BaseVoice';
import { InputVoice } from './InputVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import type { Sound, SoundPlayOptions } from './Sound';
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
export class AudioManager {
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
  /**
   * Every voice created against this manager that has not ended yet — the
   * registry {@link AudioManager.destroy} needs in order to actually silence
   * playback. `_spatial` only ever holds the subset that is being panned per
   * frame, which is why it cannot serve this purpose.
   */
  private readonly _voices = new Set<Voice>();
  private _muteOnHidden = false;
  private _destroyed = false;

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
   * Throws once the manager has been destroyed — see {@link AudioManager.destroy}.
   *
   * @param source - Any {@link Playable} asset (Sound, AudioStream, AudioGenerator).
   * @param options - Per-play overrides (bus, volume, loop, playbackRate, detune, time, muted).
   * @returns A {@link Voice} handle for the new instance.
   */
  public play(source: Sound, options?: SoundPlayOptions): Voice;
  public play(source: Playable, options?: PlayOptions): Voice;
  public play(source: Playable, options?: PlayOptions): Voice {
    this._assertLive('play');
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
    this._assertLive('open');

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

  /** {@link SystemMethods.preUpdate} phase, at {@link SystemOrder.CoreAudio}. The frame delta is unused here (hence `_delta`). */
  public preUpdate(_delta: Time): void {
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

  /** Internal: stop ticking a voice that returned to a direct graph. */
  public _unregisterSpatial(voice: SpatialVoice): void {
    this._spatial.delete(voice);
  }

  /**
   * Internal: track a live voice so {@link AudioManager.destroy} can stop it.
   * Called from the voice's own constructor, which covers every creation path —
   * `play()`, `open()`, sprite playback, and pooled replays alike.
   */
  public _registerVoice(voice: Voice): void {
    this._voices.add(voice);
  }

  /** Internal: drop a voice that has ended. Called from the voice's own teardown. */
  public _unregisterVoice(voice: Voice): void {
    this._voices.delete(voice);
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
   *
   * Effects attached to that bus are only detached, never destroyed — they
   * belong to whoever created them (see {@link AudioBus.addEffect}).
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

  /**
   * Tear the mix down: stop every voice still playing, then the listener and
   * every bus. Terminal — {@link AudioManager.play} and
   * {@link AudioManager.open} throw afterwards.
   *
   * Effects you attached to a bus or a voice are detached but not destroyed —
   * they are yours (see {@link AudioBus.addEffect}), so `destroy()` each one
   * yourself as part of your own teardown.
   */
  public destroy(): void {
    // Set before the drain so nothing can start new playback from an `onEnd`
    // handler, which is also what bounds the loop below.
    this._destroyed = true;

    const failures: unknown[] = [];

    // Voices first: tearing down the buses only detaches nodes from the graph,
    // it does not stop a source. An `<audio>` element in particular keeps
    // decoding and a buffer source keeps rendering until its voice is stopped,
    // so an unstopped voice would outlive the application it belonged to.
    //
    // Drained rather than iterated over a snapshot: a voice's `onEnd` handler
    // may register another voice, which a copy taken up front would miss and
    // the clear below would then drop while it is still playing. A Set
    // iterator visits values added after the current position, and removing
    // each entry before stopping it keeps the loop making progress.
    for (const voice of this._voices) {
      this._voices.delete(voice);
      try {
        voice.stop();
      } catch (error) {
        // A voice whose construction failed part-way through can throw out of
        // its own teardown. That must not abort the rest of the shutdown, so
        // failures are collected and reported once the tail has run — the same
        // shape as `SystemRegistry.destroy()`.
        failures.push(error);
      }
    }

    this._voices.clear();
    this.listener.destroy();
    this._spatial.clear();
    for (const bus of this._registered.values()) {
      // Note: destroying built-ins too — AudioManager is destroyed only when app shuts down.
      bus.destroy();
    }
    this._registered.clear();

    for (const error of failures) {
      logger.error('AudioManager.destroy(): a voice threw while being stopped.', {
        source: 'AudioManager',
        ...(error instanceof Error && { error }),
      });
    }
  }

  private _assertLive(method: string): void {
    if (this._destroyed) {
      throw new Error(
        `AudioManager.${method}() was called on a destroyed AudioManager. Its buses and listener are gone and it no ` +
          'longer tracks what it starts, so the voice would render into a dead graph with nothing left to stop it. ' +
          'Check the teardown order — the owning Application has already been destroyed.',
      );
    }
  }
}
