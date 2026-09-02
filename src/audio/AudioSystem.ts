import { logger } from '#core/Logger';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';

import { AudioBus } from './AudioBus';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audioContext';
import type { AudioInput } from './AudioInput';
import { AudioListener } from './AudioListener';
import type { SpatialVoice } from './BaseVoice';
import { InputVoice } from './InputVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import type { Sound, SoundPlayOptions } from './Sound';
import { createSpatialSmoothingSettings, type SpatialSmoothingSettings } from './spatialSmoothing';
import { SpatialZones } from './SpatialZones';

/**
 * The signal behind {@link AudioSystem.onUnlock}. A plain one-shot `Signal`
 * would be a trap here: `onUnlock` is the documented place to start playback
 * that cannot be deferred past the autoplay gesture, so it has to answer the
 * question every subscriber is really asking - *"run this as soon as audio is
 * usable"* - no matter when they ask.
 *
 * The contract is therefore: **every handler runs exactly once, as soon as
 * audio is usable.**
 * - Subscribing while audio is already usable replays the handler on a
 *   microtask (never synchronously inside `add()`, so the ordering matches an
 *   ordinary dispatch).
 * - Subscribing while audio is locked - including a *re*-lock after an earlier
 *   unlock - registers the handler for the next unlock.
 * - {@link UnlockSignal._unlock} clears the handler list after dispatching, so
 *   a later unlock cannot fire an already-run handler a second time. Without
 *   that, every iOS audio-session interruption would start the menu music
 *   again on top of the copy still playing.
 *
 * Deciding on the *live* lock state rather than on "has this ever dispatched"
 * is what keeps the re-lock window honest: replaying into a suspended context
 * would hand the handler a `play()` that answers with silence and a warning
 * recommending this very signal.
 *
 * `remove()` cancels either case, including a replay already queued but not yet
 * run, and `destroy()` cancels everything - the same disposal guarantee
 * {@link AudioBus.onceSetup} gives through its returned disposer.
 * @internal
 */
class UnlockSignal extends Signal {
  /**
   * Handlers whose replay microtask is queued but has not run yet. A replayed
   * handler is deliberately never registered in the base `Signal` - it must
   * fire once, not on the next unlock as well - which would leave `remove()`
   * and `destroy()` nothing to find, so the pending set is what they cancel
   * against. Without it a scene that subscribes in `init` and unsubscribes in
   * `unload` still starts music for a scene that is already gone, and a
   * handler surviving `destroy()` calls `play()` on a destroyed system, which
   * throws unobserved out of the microtask.
   */
  private readonly _pendingReplays = new Set<() => void>();
  private _disposed = false;

  public override add(handler: () => void): this {
    if (this._disposed) {
      return this;
    }

    if (isAudioContextReady()) {
      if (!this._pendingReplays.has(handler)) {
        this._pendingReplays.add(handler);
        queueMicrotask((): void => {
          // Cancelled by `remove()`/`destroy()` between `add()` and this task.
          if (this._pendingReplays.delete(handler)) {
            handler();
          }
        });
      }

      return this;
    }

    return super.add(handler);
  }

  public override remove(handler: () => void): this {
    this._pendingReplays.delete(handler);

    return super.remove(handler);
  }

  public override destroy(): void {
    this._disposed = true;
    this._pendingReplays.clear();
    super.destroy();
  }

  /**
   * Identical to {@link UnlockSignal.add} - this signal already guarantees at
   * most one call per handler, so there is no second dispatch for a `once`
   * wrapper to protect against. Delegating also keeps `remove(handler)`
   * working, which the base `once` (whose wrapper hides the handler) does not.
   */
  public override once(handler: () => void): this {
    return this.add(handler);
  }

  /**
   * Fire every handler waiting for this unlock, then drop them: each runs
   * exactly once, and a later lock/unlock cycle starts from an empty list.
   * @internal
   */
  public _unlock(): void {
    this.dispatch();
    this.clear();
  }
}

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
 * {@link AudioSystem.muteOnHidden} is enabled.
 */
export class AudioSystem {
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
   * Optional zone layer: regions of the world that contribute a parallel send
   * while the listener is inside them - a reverb zone, a muffled corridor.
   *
   * Empty and inert until a zone is added; see {@link SpatialZones}.
   */
  public readonly zones: SpatialZones = new SpatialZones();
  /**
   * Fires once when the AudioContext transitions to "running" - i.e. the first
   * user gesture unlocks audio under the browser's autoplay policy. This is the
   * canonical place to start anything that must play as soon as audio is
   * available:
   *
   * ```ts
   * app.audio.onUnlock.add(() => app.audio.play(music, { loop: true }));
   * ```
   *
   * Every handler runs **exactly once, as soon as audio is usable**, whenever
   * it subscribes: already unlocked replays it on a microtask, still locked
   * (including a re-lock after an earlier unlock - an iOS audio-session
   * interruption, a bfcache restore) registers it for the next unlock. A
   * handler that has already run is never fired again by a later unlock, so
   * looping music started here does not stack a second copy after an
   * interruption. `remove()` cancels either case, and nothing fires once the
   * system is destroyed.
   *
   * Check {@link AudioSystem.locked} for the current state. See
   * {@link AudioSystem.play} for what each asset kind does when played before
   * the gesture.
   */
  public readonly onUnlock: Signal;
  /**
   * The same object as {@link AudioSystem.onUnlock}, kept at its concrete type
   * so the internal `_unlock()` edge is reachable without a cast - `onUnlock`
   * is deliberately published as a plain {@link Signal}.
   */
  private readonly _unlockSignal: UnlockSignal;

  private readonly _registered = new Map<string, AudioBus>();
  private readonly _spatial = new Set<SpatialVoice>();
  /**
   * Every voice created against this system that has not ended yet - the
   * registry {@link AudioSystem.destroy} needs in order to actually silence
   * playback. `_spatial` only ever holds the subset that is being panned per
   * frame, which is why it cannot serve this purpose.
   */
  private readonly _voices = new Set<Voice>();
  private _muteOnHidden = false;
  private _destroyed = false;
  /**
   * Fires when a play call was dropped because the autoplay policy still blocks
   * audio - the moment a listener can act on, as opposed to
   * {@link AudioSystem.locked}, which is merely true for most of a page's life
   * and says nothing about whether anything wanted to be heard.
   *
   * Throttled with the accompanying warning: a game that plays a click every
   * frame while locked reports once, not sixty times a second, and the next
   * unlock re-arms it.
   *
   * The intended use is an interface that asks for the gesture the browser is
   * waiting for - a play overlay - and then resumes through
   * {@link AudioSystem.onUnlock}, which replays the handlers registered during
   * the lock.
   * @example
   * ```ts
   * app.audio.onPlaybackBlocked.add(() => showPlayOverlay());
   * app.audio.onUnlock.add(() => hidePlayOverlay());
   * ```
   */
  public readonly onPlaybackBlocked = new Signal();

  /**
   * Whether the "played while locked" warning has already been issued for this
   * system. Throttled per system rather than per call: a menu can fire dozens
   * of click sounds a second while audio is still locked, and every one of them
   * would produce the identical message - one line names the problem, a flood
   * buries it (and every other log the developer is reading). Re-armed by
   * {@link AudioSystem.preUpdate} once the context runs, so a context that
   * drops back to suspended later (an iOS audio-session interruption, a bfcache
   * restore) reports its own first occurrence again.
   */
  private _lockedWarningIssued = false;
  /**
   * Whether this system has already seen the current run of usable audio.
   * Drives the locked→unlocked edge that fires {@link AudioSystem.onUnlock};
   * reset the moment the context is observed suspended again, so the next
   * unlock is a fresh edge.
   */
  private _unlockObserved = false;
  private readonly _onAudioContextReady = (): void => this._syncLockState();

  public constructor() {
    this._unlockSignal = new UnlockSignal();
    this.onUnlock = this._unlockSignal;

    this.master = new AudioBus('master', { parent: null });
    this.music = new AudioBus('music', { parent: this.master });
    this.sound = new AudioBus('sound', { parent: this.master });
    this.listener = new AudioListener(this.spatial);

    // Built-ins are also lookup-able via getBus.
    this._registered.set('master', this.master);
    this._registered.set('music', this.music);
    this._registered.set('sound', this.sound);

    // Two sources for the unlock edge, deliberately:
    //
    // - `onAudioContextReady` is the fast one - it fires synchronously inside
    //   the unlock gesture, so playback starts on the same tick as the click.
    //   But it is a documented ONE-SHOT (`readyDispatched`): it cannot report a
    //   context that drops back to suspended and is resumed again, and it is
    //   already spent for any system constructed after the first gesture.
    //   Subscribing to it while already running would therefore only leak a
    //   handler that can never fire.
    // - `preUpdate` closes both gaps by polling the transition. It already
    //   reads `isAudioContextReady()` every frame to re-arm the locked-playback
    //   warning, so this adds no work - and unlike the signal it keeps working
    //   across arbitrarily many lock cycles.
    //
    // There is no per-transition stream to subscribe to instead: audio-context
    // keeps its `statechange` listener module-private and uses it only to
    // re-arm the gesture listeners.
    this._unlockObserved = isAudioContextReady();

    if (!this._unlockObserved) {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  /**
   * When `true`, the master bus is muted while `document.hidden` is true.
   * Wired to {@link Application.onVisibilityChange} via
   * {@link AudioSystem._applyVisibility}; the application calls that
   * hook automatically - set this flag to opt in to the behavior.
   */
  public get muteOnHidden(): boolean {
    return this._muteOnHidden;
  }

  public set muteOnHidden(value: boolean) {
    this._muteOnHidden = value;
    // Wiring to app.onVisibilityChange happens externally - the
    // Application is responsible for calling _applyVisibility() when
    // visibility changes.
  }

  /**
   * `true` while audio is blocked by the browser's autoplay policy - no user
   * gesture has resumed the AudioContext yet.
   *
   * What a play call does while locked depends on the asset: an
   * {@link AudioStream} is deferred and starts on the gesture, because a media
   * element owns its own playhead and can simply be told to play later. A
   * {@link Sound} or an {@link AudioGenerator} is **skipped** - it returns an
   * already-ended voice and never makes a sound. Neither can be deferred
   * honestly: a suspended context's `currentTime` stands still, so every
   * source scheduled while locked lands on the same instant and the entire
   * backlog would fire simultaneously on the gesture.
   *
   * Start such playback from {@link AudioSystem.onUnlock} instead.
   */
  public get locked(): boolean {
    return !isAudioContextReady();
  }

  /**
   * Report the first play call this system skipped because audio was still
   * locked, then stay quiet until audio unlocks - see
   * {@link AudioSystem._lockedWarningIssued} for why it is throttled.
   * @internal Called by the {@link Playable} implementations that skip.
   */
  public _warnPlaybackWhileLocked(asset: string): void {
    if (this._lockedWarningIssued) {
      return;
    }

    this._lockedWarningIssued = true;
    this.onPlaybackBlocked.dispatch();
    logger.warn(
      `AudioSystem.play() was called while audio is still locked by the browser's autoplay policy; the ${asset} was skipped. ` +
        'Start playback from the unlock gesture instead — `app.audio.onUnlock.add(() => app.audio.play(music, { loop: true }))` — ' +
        'or gate it on `app.audio.locked`. Further skipped plays are not reported until audio unlocks.',
      { source: 'AudioSystem' },
    );
  }

  /**
   * Play a {@link Playable} asset and return a {@link Voice} handle.
   *
   * Each call creates an independent playback instance. Call `play()` again
   * to start another concurrent voice. The returned Voice lets you control
   * this specific instance (`stop()`, `volume`, `fade()`, capabilities).
   *
   * When `source` is a {@link Sound}, `options` widens to
   * {@link SoundPlayOptions} and additionally accepts `replace: true`, which
   * stops all currently-playing instances of that sound before the new one
   * starts (singleton-replace mode).
   *
   * @example
   * ```ts
   * const voice = app.audio.play(shootSfx);
   * // Later:
   * voice.stop();
   * ```
   *
   * While audio is still locked by the browser's autoplay policy
   * ({@link AudioSystem.locked}), a {@link Sound} or {@link AudioGenerator}
   * play call is a **no-op**: it returns an already-ended voice and warns once.
   * An {@link AudioStream} is deferred and starts on the unlock gesture. Start
   * the former from {@link AudioSystem.onUnlock}:
   *
   * ```ts
   * app.audio.onUnlock.add(() => app.audio.play(music, { loop: true }));
   * ```
   *
   * Throws once the system has been destroyed - see {@link AudioSystem.destroy}.
   *
   * @param source - Any {@link Playable} asset (Sound, AudioStream, AudioGenerator).
   * @param options - Per-play overrides (bus, volume, loop, playbackRate, detune,
   * time, muted, plus `position` and the spatial attenuation fields).
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
   * {@link InputVoice}. The input is analysis-only by default (not audible) -
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
      system: this,
      volume: 1,
      sourceNode,
      stream: input.stream,
    });
  }

  /** {@link SystemMethods.preUpdate} phase, at {@link SystemOrder.CoreAudio}. The frame delta is unused here (hence `_delta`). */
  public preUpdate(_delta: Seconds): void {
    this._syncLockState();
    this.listener._tick();
    // Tick spatial voices and prune ended ones.
    for (const voice of this._spatial) {
      if (voice.ended) {
        this._spatial.delete(voice);
        continue;
      }
      voice._tickSpatial();
    }

    // After the listener moved and the voices followed it, so a zone crossing is
    // reconciled against this frame's positions rather than last frame's.
    if (this.zones.active) {
      this.zones._tick(this.listener, this._voices);
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
   * Internal: track a live voice so {@link AudioSystem.destroy} can stop it.
   * Called from the voice's own constructor, which covers every creation path -
   * `play()`, `open()`, sprite playback, and pooled replays alike.
   */
  public _registerVoice(voice: Voice): void {
    this._voices.add(voice);
  }

  /** Internal: drop a voice that has ended. Called from the voice's own teardown. */
  public _unregisterVoice(voice: Voice): void {
    this._voices.delete(voice);
    // The voice destroys its own sends; this only drops the zone layer's map
    // entry, which would otherwise keep the ended voice reachable.
    this.zones._forget(voice);
  }

  /**
   * Observe the current autoplay-lock state and act on a transition: fire
   * {@link AudioSystem.onUnlock} on the locked→unlocked edge, and re-arm the
   * one-shot locked-playback warning while audio is usable so a later re-lock
   * reports its own first occurrence.
   *
   * Called from the frame tick and from the global ready signal - see the
   * constructor for why both are needed. Idempotent: only an actual edge
   * dispatches.
   */
  private _syncLockState(): void {
    if (this._destroyed) {
      return;
    }

    if (!isAudioContextReady()) {
      this._unlockObserved = false;

      return;
    }

    this._lockedWarningIssued = false;

    if (this._unlockObserved) {
      return;
    }

    this._unlockObserved = true;
    this._unlockSignal._unlock();
  }

  /** Internal: called by Application when visibility changes. */
  public _applyVisibility(visible: boolean): void {
    if (this._muteOnHidden) {
      this.master.muted = !visible;
    }
  }

  /**
   * Register a user-constructed {@link AudioBus} so it can be looked up by
   * name via {@link AudioSystem.getBus}. Throws if a bus with the same
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
   * Effects attached to that bus are only detached, never destroyed - they
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
   * every bus. Terminal - {@link AudioSystem.play} and
   * {@link AudioSystem.open} throw afterwards.
   *
   * Effects you attached to a bus or a voice are detached but not destroyed -
   * they are yours (see {@link AudioBus.addEffect}), so `destroy()` each one
   * yourself as part of your own teardown.
   */
  public destroy(): void {
    // Set before the drain so nothing can start new playback from an `onEnd`
    // handler, which is also what bounds the loop below.
    this._destroyed = true;

    // Silence the unlock path first: a queued replay or a handler still waiting
    // for the gesture would otherwise call `play()` on this very system after
    // it has gone terminal. Dropping the global subscription matters beyond
    // this system - a handler that throws inside `onAudioContextReady`'s
    // dispatch terminates that dispatch outright, so a dead Application could
    // otherwise stop a live one's buses from ever being set up. Symmetric with
    // `AudioBus.destroy` and `AudioListener.destroy`.
    onAudioContextReady.remove(this._onAudioContextReady);
    this._unlockSignal.destroy();
    this.onPlaybackBlocked.destroy();

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
        // failures are collected and reported once the tail has run - the same
        // shape as `SystemRegistry.destroy()`.
        failures.push(error);
      }
    }

    this._voices.clear();
    // Before the buses: a zone send is an edge into a bus, and the voices that
    // held those edges have just been stopped.
    this.zones.clear();
    this.listener.destroy();
    this._spatial.clear();
    for (const bus of this._registered.values()) {
      // Note: destroying built-ins too - AudioSystem is destroyed only when app shuts down.
      bus.destroy();
    }
    this._registered.clear();

    for (const error of failures) {
      logger.error('AudioSystem.destroy(): a voice threw while being stopped.', {
        source: 'AudioSystem',
        ...(error instanceof Error && { error }),
      });
    }
  }

  private _assertLive(method: string): void {
    if (this._destroyed) {
      throw new Error(
        `AudioSystem.${method}() was called on a destroyed AudioSystem. Its buses and listener are gone and it no ` +
          'longer tracks what it starts, so the voice would render into a dead graph with nothing left to stop it. ' +
          'Check the teardown order — the owning Application has already been destroyed.',
      );
    }
  }
}
