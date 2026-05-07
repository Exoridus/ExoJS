import { clamp } from '@/math/utils';
import { onAudioContextReady, isAudioContextReady, getAudioContext } from './audio-context';
import type { AudioFilter } from './AudioFilter';

/** Construction options for {@link AudioBus}. */
export interface AudioBusOptions {
    parent?: AudioBus | null;
    volume?: number;
    muted?: boolean;
    pan?: number;
    filters?: ReadonlyArray<AudioFilter>;
}

interface AudioBusSetup {
    readonly audioContext: AudioContext;
    readonly inputNode: GainNode;     // bus input — sounds connect here
    readonly outputNode: GainNode;    // bus output — connects to parent's input or destination
    readonly panNode: StereoPannerNode;
}

/**
 * Hierarchical mixer node in the engine's audio routing graph. Each bus
 * owns three Web Audio nodes (input gain, optional filter chain, stereo
 * pan, output gain) and routes its output into its parent's input — the
 * root bus connects to the destination.
 *
 * The three engine-built-in busses are constructed by {@link AudioManager}:
 * `master` (root), `music` (child of master), `sound` (child of master).
 * User code creates additional busses via `new AudioBus(name, { parent })`
 * and registers them via {@link AudioManager.registerBus}.
 *
 * Volume is in 0..2 (1 = unity), pan is -1..1, mute is a boolean override.
 * {@link AudioBus.fadeIn} / {@link AudioBus.fadeOut} produce smooth ramps
 * over the output gain. Filter changes via {@link AudioBus.addFilter} /
 * {@link AudioBus.removeFilter} rebuild the chain in place.
 *
 * Setup is deferred until the global `AudioContext` is unlocked
 * (browser autoplay policy); operations that need live nodes are no-ops
 * until that happens.
 */
export class AudioBus {
    public readonly name: string;
    private _parent: AudioBus | null;
    private _volume: number;
    private _muted: boolean;
    private _pan: number;
    private readonly _filters: Array<AudioFilter> = [];
    private _setup: AudioBusSetup | null = null;
    private _scheduledStopId: ReturnType<typeof setTimeout> | null = null;

    public constructor(name: string, options: AudioBusOptions = {}) {
        if (!name || typeof name !== 'string') {
            throw new Error('AudioBus requires a non-empty string name.');
        }
        this.name = name;
        this._parent = options.parent ?? null;
        this._volume = clamp(options.volume ?? 1, 0, 2);
        this._muted = options.muted ?? false;
        this._pan = clamp(options.pan ?? 0, -1, 1);

        if (options.filters) {
            this._filters.push(...options.filters);
        }

        if (isAudioContextReady()) {
            this._setupAudio(getAudioContext());
        } else {
            onAudioContextReady.once(this._setupAudio, this);
        }
    }

    public get parent(): AudioBus | null {
        return this._parent;
    }

    public get volume(): number {
        return this._volume;
    }

    public set volume(value: number) {
        const clamped = clamp(value, 0, 2);
        if (this._volume === clamped) return;
        this._volume = clamped;
        this._applyVolume();
    }

    public get muted(): boolean {
        return this._muted;
    }

    public set muted(value: boolean) {
        if (this._muted === value) return;
        this._muted = value;
        this._applyVolume();
    }

    public get pan(): number {
        return this._pan;
    }

    public set pan(value: number) {
        const clamped = clamp(value, -1, 1);
        if (this._pan === clamped) return;
        this._pan = clamped;
        if (this._setup) {
            this._setup.panNode.pan.setTargetAtTime(
                clamped,
                this._setup.audioContext.currentTime,
                0.01,
            );
        }
    }

    public get inputNode(): GainNode | null {
        return this._setup?.inputNode ?? null;
    }

    /**
     * Append a filter to the end of the chain (before the pan stage). The
     * chain is rebuilt in place; existing audio routes through the new
     * filter on the next frame.
     */
    public addFilter(filter: AudioFilter): this {
        this._filters.push(filter);
        this._rebuildFilterChain();
        return this;
    }

    /** Remove `filter` from the chain. No-op if not present. Caller still owns + must `destroy()` it. */
    public removeFilter(filter: AudioFilter): this {
        const index = this._filters.indexOf(filter);
        if (index !== -1) {
            this._filters.splice(index, 1);
            this._rebuildFilterChain();
        }
        return this;
    }

    /**
     * Linearly ramp the output gain from 0 to the current volume over
     * `durationMs`. Cancels any in-flight ramps on the same gain node.
     */
    public fadeIn(durationMs: number): this {
        this._clearScheduledStop();
        if (durationMs <= 0 || !this._setup) {
            return this;
        }
        const ctx = this._setup.audioContext;
        const node = this._setup.outputNode;
        const target = this._muted ? 0 : this._volume;
        node.gain.cancelScheduledValues(ctx.currentTime);
        node.gain.setValueAtTime(0, ctx.currentTime);
        node.gain.linearRampToValueAtTime(target, ctx.currentTime + durationMs / 1000);
        return this;
    }

    /**
     * Linearly ramp the output gain to 0 over `durationMs`. By default
     * mutes the bus once the ramp completes (`stopAfter: true`); pass
     * `stopAfter: false` to let the ramp finish silently while leaving
     * `muted` unchanged.
     */
    public fadeOut(durationMs: number, options: { stopAfter?: boolean } = {}): this {
        const stopAfter = options.stopAfter ?? true;
        this._clearScheduledStop();
        if (durationMs <= 0 || !this._setup) {
            if (stopAfter) this.muted = true;
            return this;
        }
        const ctx = this._setup.audioContext;
        const node = this._setup.outputNode;
        node.gain.cancelScheduledValues(ctx.currentTime);
        node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
        node.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);
        if (stopAfter) {
            this._scheduledStopId = setTimeout(() => {
                this._scheduledStopId = null;
                this.muted = true;
            }, durationMs);
        }
        return this;
    }

    public destroy(): void {
        onAudioContextReady.clearByContext(this);
        this._clearScheduledStop();
        for (const filter of this._filters) {
            filter.destroy();
        }
        this._filters.length = 0;
        if (this._setup) {
            this._setup.inputNode.disconnect();
            this._setup.outputNode.disconnect();
            this._setup.panNode.disconnect();
            this._setup = null;
        }
    }

    /** Internal: returns the input GainNode where children should connect. */
    public _getInputNode(): GainNode | null {
        return this._setup?.inputNode ?? null;
    }

    /** Internal: returns the output GainNode that connects upstream. */
    public _getOutputNode(): GainNode | null {
        return this._setup?.outputNode ?? null;
    }

    private _setupAudio(audioContext: AudioContext): void {
        const inputNode = audioContext.createGain();
        const panNode = audioContext.createStereoPanner();
        const outputNode = audioContext.createGain();

        // Internal chain: input → [filters...] → pan → output
        outputNode.gain.setTargetAtTime(this._muted ? 0 : this._volume, audioContext.currentTime, 0.01);
        panNode.pan.setTargetAtTime(this._pan, audioContext.currentTime, 0.01);

        this._setup = { audioContext, inputNode, outputNode, panNode };
        this._rebuildFilterChain();
        this._connectUpstream();
    }

    private _connectUpstream(): void {
        if (!this._setup) return;
        if (this._parent) {
            const parentInput = this._parent._getInputNode();
            if (parentInput) {
                this._setup.outputNode.connect(parentInput);
            } else {
                // Parent not yet ready — subscribe to parent's setup
                this._parent.onceSetup(() => {
                    if (this._setup && this._parent) {
                        const node = this._parent._getInputNode();
                        if (node) this._setup.outputNode.connect(node);
                    }
                });
            }
        } else {
            this._setup.outputNode.connect(this._setup.audioContext.destination);
        }
    }

    /** Subscribe to the moment this bus's audio nodes are ready. Internal use. */
    public onceSetup(callback: () => void): void {
        if (this._setup) {
            callback();
        } else {
            onAudioContextReady.once(() => {
                if (this._setup) callback();
            }, this);
        }
    }

    private _rebuildFilterChain(): void {
        if (!this._setup) return;
        const { inputNode, panNode } = this._setup;

        // Disconnect current chain
        inputNode.disconnect();
        for (const filter of this._filters) {
            filter.inputNode.disconnect();
            filter.outputNode.disconnect();
        }
        panNode.disconnect();

        // Rebuild: input → filter[0].input → filter[0].output → filter[1].input → ... → pan → output
        let prev: AudioNode = inputNode;
        for (const filter of this._filters) {
            prev.connect(filter.inputNode);
            prev = filter.outputNode;
        }
        prev.connect(panNode);
        panNode.connect(this._setup.outputNode);
    }

    private _applyVolume(): void {
        if (!this._setup) return;
        const target = this._muted ? 0 : this._volume;
        this._setup.outputNode.gain.setTargetAtTime(
            target,
            this._setup.audioContext.currentTime,
            0.01,
        );
    }

    private _clearScheduledStop(): void {
        if (this._scheduledStopId !== null) {
            clearTimeout(this._scheduledStopId);
            this._scheduledStopId = null;
        }
    }
}
