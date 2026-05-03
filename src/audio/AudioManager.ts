import { AudioBus } from './AudioBus';
import { AudioListener } from './AudioListener';
import type { Sound } from './Sound';

export class AudioManager {
    public readonly master: AudioBus;
    public readonly music: AudioBus;
    public readonly sound: AudioBus;
    public readonly listener: AudioListener;

    private readonly _registered = new Map<string, AudioBus>();
    private readonly _spatialSounds: Set<Sound> = new Set();
    private _muteOnHidden: boolean = false;

    public constructor() {
        this.master = new AudioBus('master', { parent: null });
        this.music = new AudioBus('music', { parent: this.master });
        this.sound = new AudioBus('sound', { parent: this.master });
        this.listener = new AudioListener();

        // Built-ins are also lookup-able via getBus.
        this._registered.set('master', this.master);
        this._registered.set('music', this.music);
        this._registered.set('sound', this.sound);
    }

    public get muteOnHidden(): boolean {
        return this._muteOnHidden;
    }

    public set muteOnHidden(value: boolean) {
        this._muteOnHidden = value;
        // Wiring to app.onVisibilityChange happens externally — the
        // Application is responsible for calling _applyVisibility() when
        // visibility changes.
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

    public registerBus(bus: AudioBus): this {
        if (this._registered.has(bus.name)) {
            throw new Error(`Audio bus "${bus.name}" is already registered.`);
        }
        this._registered.set(bus.name, bus);
        return this;
    }

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

    public getBus(name: string): AudioBus {
        const bus = this._registered.get(name);
        if (!bus) {
            throw new Error(`Audio bus "${name}" is not registered.`);
        }
        return bus;
    }

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

export function getAudioManager(): AudioManager {
    if (_manager === null) {
        _manager = new AudioManager();
    }
    return _manager;
}

/** For tests: reset the singleton so fresh instances can be created. */
export function _resetAudioManagerForTesting(): void {
    if (_manager) {
        _manager.destroy();
        _manager = null;
    }
}
