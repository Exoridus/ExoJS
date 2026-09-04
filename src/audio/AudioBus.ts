import { assert } from '#core/dev';
import { logger } from '#core/Logger';
import type { Seconds } from '#core/units';
import { clamp } from '#math/utils';

import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audioContext';
import type { AudioEffect } from './AudioEffect';
import { isEffectReady } from './AudioEffect';

/** Construction options for {@link AudioBus}. */
export interface AudioBusOptions {
  parent?: AudioBus | null;
  volume?: number;
  muted?: boolean;
  pan?: number;
  effects?: readonly AudioEffect[];
}

interface AudioBusSetup {
  readonly audioContext: AudioContext;
  readonly inputNode: GainNode; // bus input — sounds connect here
  readonly outputNode: GainNode; // bus output — connects to parent's input or destination
  readonly panNode: StereoPannerNode;
}

/**
 * Hierarchical mixer node in the engine's audio routing graph. Each bus
 * owns three Web Audio nodes (input gain, optional effect chain, stereo
 * pan, output gain) and routes its output into its parent's input - the
 * root bus connects to the destination.
 *
 * The three engine-built-in busses are constructed by {@link AudioSystem}:
 * `master` (root), `music` (child of master), `sound` (child of master).
 * User code creates additional busses via `new AudioBus(name, { parent })`
 * and registers them via {@link AudioSystem.registerBus}.
 *
 * Volume is in 0..2 (1 = unity), pan is -1..1, mute is a boolean override.
 * {@link AudioBus.fadeIn} / {@link AudioBus.fadeOut} produce smooth ramps
 * over the output gain. Effect changes via {@link AudioBus.addEffect} /
 * {@link AudioBus.removeEffect} rebuild the chain in place.
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
  private readonly _effects: AudioEffect[] = [];
  private _setup: AudioBusSetup | null = null;
  private _destroyed = false;
  private _scheduledStopId: ReturnType<typeof setTimeout> | null = null;
  /**
   * Callbacks queued via {@link AudioBus.onceSetup} while the context is still
   * locked, flushed once this bus's nodes exist. Kept on the bus (not the global
   * unlock signal) so pre-gesture deferrals don't accumulate there and are
   * dropped on {@link AudioBus.destroy} (AU3).
   */
  private _pendingSetup: Array<() => void> | null = null;
  /** Unsubscribe for this bus's deferred connect to a not-yet-ready parent. */
  private _parentSetupDispose: (() => void) | null = null;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupAudio(ctx);
  };

  public constructor(name: string, options: AudioBusOptions = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('AudioBus requires a non-empty string name.');
    }
    this.name = name;
    this._parent = options.parent ?? null;
    this._volume = clamp(options.volume ?? 1, 0, 2);
    this._muted = options.muted ?? false;
    this._pan = clamp(options.pan ?? 0, -1, 1);

    if (options.effects) {
      this._effects.push(...options.effects);
    }

    if (isAudioContextReady()) {
      this._setupAudio(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
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
      this._setup.panNode.pan.setTargetAtTime(clamped, this._setup.audioContext.currentTime, 0.01);
    }
  }

  public get inputNode(): GainNode | null {
    return this._setup?.inputNode ?? null;
  }

  /**
   * Append a effect to the end of the chain (before the pan stage). The
   * chain is rebuilt in place; existing audio routes through the new
   * effect on the next frame.
   *
   * Attaching does not transfer ownership: the caller keeps it and must
   * `destroy()` the effect once it is no longer used anywhere. Neither
   * {@link AudioBus.removeEffect} nor {@link AudioBus.destroy} destroys it.
   *
   * A no-op once the bus has been {@link AudioBus.destroy}ed - without this
   * guard the effect would silently accumulate in the (otherwise unused)
   * internal list forever.
   *
   * Attaching the same effect twice is a caller error: the rebuilt chain would
   * wire the effect's output back into its own input, producing a feedback
   * loop. The dev build asserts; production ignores the second attach.
   */
  public addEffect(effect: AudioEffect): this {
    if (this._destroyed) return this;

    if (this._effects.includes(effect)) {
      assert(false, 'AudioBus.addEffect: this effect is already attached to the bus.');

      return this;
    }

    this._effects.push(effect);
    this._rebuildEffectChain();
    return this;
  }

  /**
   * Remove `effect` from the chain. No-op if not present. The caller still
   * owns it and must `destroy()` it - the same contract {@link AudioBus.destroy}
   * follows for whatever is still attached when the bus goes away.
   */
  public removeEffect(effect: AudioEffect): this {
    const index = this._effects.indexOf(effect);
    if (index !== -1) {
      this._effects.splice(index, 1);
      // Detach the removed effect's output from the graph before rewiring: the
      // rebuild below only touches the effects still in the chain, so an
      // outgoing edge left live would keep feeding the pan stage and let a
      // delay/reverb tail bleed through after removal. Its internal input
      // wiring is deliberately left intact so the caller can reuse the effect
      // (same contract as `BaseVoice.removeEffect`). Skipped for an effect
      // whose own nodes have not been created yet - it was never wired in.
      if (isEffectReady(effect)) {
        effect.outputNode.disconnect();
      }
      this._rebuildEffectChain();
    }
    return this;
  }

  /**
   * Linearly ramp the output gain from 0 to the current volume over
   * `duration`. Cancels any in-flight ramps on the same gain node.
   */
  public fadeIn(duration: Seconds): this {
    this._clearScheduledStop();
    if (duration <= 0 || !this._setup) {
      return this;
    }
    const ctx = this._setup.audioContext;
    const node = this._setup.outputNode;
    const target = this._muted ? 0 : this._volume;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setValueAtTime(0, ctx.currentTime);
    node.gain.linearRampToValueAtTime(target, ctx.currentTime + duration);
    return this;
  }

  /**
   * Linearly ramp the output gain to 0 over `duration`. By default mutes the
   * bus once the ramp completes (`stopAfter: true`); pass `stopAfter: false`
   * to let the ramp finish silently while leaving `muted` unchanged.
   */
  public fadeOut(duration: Seconds, options: { stopAfter?: boolean } = {}): this {
    const stopAfter = options.stopAfter ?? true;
    this._clearScheduledStop();
    if (duration <= 0 || !this._setup) {
      if (stopAfter) this.muted = true;
      return this;
    }
    const ctx = this._setup.audioContext;
    const node = this._setup.outputNode;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
    node.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    if (stopAfter) {
      this._scheduledStopId = setTimeout(() => {
        this._scheduledStopId = null;
        this.muted = true;
      }, duration * 1000);
    }
    return this;
  }

  /**
   * Tear the bus down: drop pending setup work, detach every attached effect
   * and disconnect this bus's own nodes from the graph.
   *
   * Attached effects are detached, **not** destroyed - a bus never owns them
   * (see {@link AudioBus.addEffect}), and the same instance may still be in
   * use on a voice or another bus. Destroy each effect yourself once it is no
   * longer needed anywhere.
   */
  public destroy(): void {
    this._destroyed = true;
    onAudioContextReady.remove(this._onAudioContextReady);
    this._parentSetupDispose?.();
    this._parentSetupDispose = null;
    // Drop any setup callbacks still queued on this bus so they neither fire nor
    // linger after teardown (AU3).
    this._pendingSetup = null;
    this._clearScheduledStop();
    // Detach, never destroy: a bus does not own the effects handed to it. The
    // same instance may also sit on a voice or on another bus, and destroying
    // it here would pull it out from under them. Mirrors
    // {@link AudioBus.removeEffect} and `BaseVoice._finish` - cut the outgoing
    // edge, leave the effect's own internal wiring intact, skip an effect whose
    // nodes were never created.
    for (const effect of this._effects) {
      if (isEffectReady(effect)) {
        effect.outputNode.disconnect();
      }
    }
    this._effects.length = 0;
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

    // Internal chain: input → [effects...] → pan → output
    outputNode.gain.setTargetAtTime(this._muted ? 0 : this._volume, audioContext.currentTime, 0.01);
    panNode.pan.setTargetAtTime(this._pan, audioContext.currentTime, 0.01);

    this._setup = { audioContext, inputNode, outputNode, panNode };
    this._rebuildEffectChain();
    this._connectUpstream();
    this._flushPendingSetup();
  }

  private _connectUpstream(): void {
    if (!this._setup) return;
    if (this._parent) {
      const parentInput = this._parent._getInputNode();
      if (parentInput) {
        this._setup.outputNode.connect(parentInput);
      } else {
        // Parent not yet ready - subscribe to parent's setup, keeping the
        // disposer so a teardown before the parent unlocks unsubscribes (AU3).
        this._parentSetupDispose = this._parent.onceSetup(() => {
          this._parentSetupDispose = null;
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

  /** Run every callback queued via {@link AudioBus.onceSetup} now that the nodes exist. */
  private _flushPendingSetup(): void {
    const pending = this._pendingSetup;
    if (pending === null) return;
    this._pendingSetup = null;
    for (const callback of pending) {
      callback();
    }
  }

  /**
   * Run `callback` the moment this bus's audio nodes are ready: immediately if it
   * is already set up, otherwise queued on the bus and flushed when the context
   * unlocks. Returns an unsubscribe function that removes the still-pending
   * callback (a no-op once it has fired). Internal use.
   *
   * The queue lives on the bus rather than the global unlock signal, so many
   * voices deferring a reconnect before the first user gesture do not pile
   * listeners onto that singleton, and anything torn down pre-unlock drops its
   * own pending callback (AU3).
   */
  public onceSetup(callback: () => void): () => void {
    if (this._setup) {
      callback();
      return (): void => undefined;
    }

    const pending = (this._pendingSetup ??= []);
    pending.push(callback);

    return (): void => {
      if (this._pendingSetup === null) return;
      const index = this._pendingSetup.indexOf(callback);
      if (index !== -1) this._pendingSetup.splice(index, 1);
    };
  }

  private _rebuildEffectChain(retried = false): void {
    if (!this._setup) return;
    const { inputNode, panNode } = this._setup;

    // An effect attached via `addEffect()` before the shared AudioContext became
    // ready may not have finished its OWN setup yet: `onAudioContextReady`
    // dispatches to every registered listener in a single synchronous pass, and
    // this bus's listener - typically registered early, e.g. at AudioSystem
    // construction - can run before an attached effect's listener (registered
    // later, e.g. from a Scene's async `init()`). Touching that effect's
    // `inputNode`/`outputNode` here would throw ("not yet initialized").
    // Retrying once on a microtask is sufficient: by then every listener queued
    // for that same dispatch pass - including the effect's own setup - has
    // already run.
    if (!retried && this._effects.some(effect => !isEffectReady(effect))) {
      queueMicrotask(() => this._rebuildEffectChain(true));
      return;
    }

    // Resolve the chain BEFORE touching the graph. An effect still not ready on
    // the retry pass throws from `inputNode`/`outputNode`, and the retry runs
    // inside a `queueMicrotask` where no caller can catch it - a throw part-way
    // through the rewiring below would leave the bus input cut from the pan
    // stage and silence the whole subtree with an unrelated stack. Such an
    // effect is bypassed instead, so the bus keeps passing audio.
    const chain: AudioEffect[] = [];

    for (const effect of this._effects) {
      if (isEffectReady(effect)) {
        chain.push(effect);
        continue;
      }

      logger.warn(
        `AudioBus: effect ${effect.constructor.name} never finished its setup and is bypassed on bus "${this.name}". ` +
          'Await its `ready` promise before attaching it, or check that a custom effect wires up its input and output nodes.',
        { source: 'AudioBus', once: `audiobus-effect-unready:${effect.constructor.name}` },
      );
    }

    // Disconnect current chain. Only the edges this bus created are cut: the
    // bus input, each effect's output, and the pan stage. An effect's *input*
    // node is deliberately left alone - for any effect built from more than
    // one node (a wet/dry mix, a filter bank) the edges leaving its input node
    // are its own internal wiring, and disconnecting them silences the effect
    // permanently.
    inputNode.disconnect();
    for (const effect of chain) {
      effect.outputNode.disconnect();
    }
    panNode.disconnect();

    // Rebuild: input → effect[0].input → effect[0].output → effect[1].input → ... → pan → output
    let prev: AudioNode = inputNode;
    for (const effect of chain) {
      prev.connect(effect.inputNode);
      prev = effect.outputNode;
    }
    prev.connect(panNode);
    panNode.connect(this._setup.outputNode);
  }

  private _applyVolume(): void {
    if (!this._setup) return;
    const target = this._muted ? 0 : this._volume;
    this._setup.outputNode.gain.setTargetAtTime(target, this._setup.audioContext.currentTime, 0.01);
  }

  private _clearScheduledStop(): void {
    if (this._scheduledStopId !== null) {
      clearTimeout(this._scheduledStopId);
      this._scheduledStopId = null;
    }
  }
}
