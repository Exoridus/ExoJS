import { Signal } from '#core/Signal';

import { isAudioContextReady, onAudioContextReady } from './audio-context';
import { AudioBus } from './AudioBus';
import { AudioListener } from './AudioListener';
import type { Sound } from './Sound';

/**
 * Module-level singleton that owns the engine-wide audio mix: three
 * pre-configured {@link AudioBus} instances (`master` ← `music` + `sound`),
 * a single shared {@link AudioListener} for spatial audio, and a registry
 * of any extra busses the user constructs.
 *
 * Access the singleton via {@link getAudioManager} (or `app.audio`). The
 * instance is constructed lazily on first access so client code that does
 * not need audio pays no startup cost.
 *
 * Drives the per-frame `_tick()` on the listener and every spatial sound;
 * propagates visibility-driven mute when {@link AudioManager.muteOnHidden}
 * is enabled.
 */
export class AudioManager {
  public readonly master: AudioBus;
  public readonly music: AudioBus;
  public readonly sound: AudioBus;
  public readonly listener: AudioListener;
  /**
   * Fires once when the AudioContext transitions to "running" — i.e. the first
   * user gesture unlocks audio under the browser's autoplay policy. Check
   * {@link AudioManager.locked} for the current state; sounds played while
   * locked are deferred and start automatically on that gesture.
   */
  public readonly onUnlock = new Signal();

  private readonly _registered = new Map<string, AudioBus>();
  private readonly _spatialSounds = new Set<Sound>();
  private _muteOnHidden = false;

  public constructor() {
    this.master = new AudioBus('master', { parent: null });
    this.music = new AudioBus('music', { parent: this.master });
    this.sound = new AudioBus('sound', { parent: this.master });
    this.listener = new AudioListener();

    // Built-ins are also lookup-able via getBus.
    this._registered.set('master', this.master);
    this._registered.set('music', this.music);
    this._registered.set('sound', this.sound);

    onAudioContextReady.add((): void => {
      this.onUnlock.dispatch();
    });
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
   * gesture has resumed the AudioContext yet. {@link Sound} and {@link Music}
   * played while locked are deferred and start automatically on the first
   * gesture, so you can simply call `play()` and (optionally) render a
   * "tap to start" prompt while this is `true`. Pairs with {@link onUnlock}.
   */
  public get locked(): boolean {
    return !isAudioContextReady();
  }

  /** Called once per frame from Application.update(). */
  public update(): void {
    this.listener._tick();
    for (const sound of this._spatialSounds) {
      sound._tickSpatial();
    }
  }

  /** Internal: called by Sound when it becomes spatial. */
  public _registerSpatialSound(sound: Sound): void {
    this._spatialSounds.add(sound);
  }

  /** Internal: called by Sound when it stops being spatial. */
  public _unregisterSpatialSound(sound: Sound): void {
    this._spatialSounds.delete(sound);
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
    this._spatialSounds.clear();
    for (const bus of this._registered.values()) {
      // Note: destroying built-ins too — AudioManager is destroyed only when app shuts down.
      bus.destroy();
    }
    this._registered.clear();
  }
}

// Module-level singleton (lazy)
let _manager: AudioManager | null = null;

/**
 * Lazy accessor for the singleton {@link AudioManager}. Constructs the
 * instance on first call, returns the same instance for every subsequent
 * call. Equivalent to `app.audio`.
 */
export function getAudioManager(): AudioManager {
  if (_manager === null) {
    _manager = new AudioManager();
  }
  return _manager;
}

/**
 * Dispose and clear the module-level audio singleton.
 *
 * Useful for deterministic teardown between independent engine lifecycles
 * (for example hot-reload flows, embedded runtimes, or test harnesses that
 * spin up multiple isolated apps in one process).
 */
export function disposeAudioManager(): void {
  if (_manager) {
    _manager.destroy();
    _manager = null;
  }
}
