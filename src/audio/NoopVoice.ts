import type { SceneNode } from '#core/SceneNode';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import type { Vector } from '#math/Vector';

import type { AudioBus } from './AudioBus';
import { getAudioContext } from './audioContext';
import type { AudioEffect } from './AudioEffect';
import type { AudioSend } from './AudioSend';
import type { DistanceModel, SpatialPoint, Voice } from './Playable';

/** Shared empty list, so `sends` never allocates on a voice that can never have one. */
const emptySends: readonly AudioSend[] = Object.freeze([]);

/**
 * An already-ended {@link Voice} returned for degenerate play calls - a seek
 * offset past the asset's duration, or a generator played before the
 * `AudioContext` is unlocked. All controls are inert; `ended` is `true` from
 * the start and {@link NoopVoice.onEnd} never fires.
 *
 * @internal
 */
export class NoopVoice implements Voice {
  public readonly onEnd = new Signal();
  private readonly _bus: AudioBus;
  private _output: AudioNode | null = null;

  public constructor(bus: AudioBus) {
    this._bus = bus;
  }

  public get ended(): boolean {
    return true;
  }

  public get output(): AudioNode {
    return (this._output ??= getAudioContext().createGain());
  }

  public get volume(): number {
    return 0;
  }

  public set volume(_value: number) {
    // inert - the voice already ended
  }

  public get bus(): AudioBus {
    return this._bus;
  }

  public set bus(_bus: AudioBus) {
    // inert - the voice already ended
  }

  public fade(_to: number, _duration: Seconds): void {
    // inert - the voice already ended
  }

  public stop(_fade?: Seconds): void {
    // inert - the voice already ended
  }

  public addEffect(_effect: AudioEffect): this {
    return this;
  }

  public removeEffect(_effect: AudioEffect): this {
    return this;
  }

  public get sends(): readonly AudioSend[] {
    return emptySends;
  }

  public addSend(_bus: AudioBus, _level?: number): AudioSend {
    // A send on a voice that already ended would tap a graph with nothing in it.
    // Refusing loudly beats handing back a dead object the caller has to check.
    throw new Error('Cannot open an audio send on a voice that has already ended.');
  }

  public removeSend(_send: AudioSend): this {
    return this;
  }

  /** @internal */
  public _adoptSend(send: AudioSend): void {
    // Nothing to adopt it into - this voice has already ended, so the send would
    // tap a graph with nothing in it.
    send.destroy();
  }

  // Spatializable - inert like the rest of this class. A voice that has
  // already ended has nowhere to place a panner, but the getters still answer
  // with the documented defaults so a caller that positions a voice without
  // checking `ended` reads back something coherent.

  public get position(): Vector | null {
    return null;
  }

  public set position(_value: Vector | SpatialPoint | null) {
    // inert - the voice already ended
  }

  public get elevation(): number {
    return 0;
  }

  public set elevation(_value: number) {
    // inert - the voice already ended
  }

  public get occlusion(): number {
    return 0;
  }

  public set occlusion(_value: number) {
    // inert - the voice already ended
  }

  public follow(_node: SceneNode | null): void {
    // inert - the voice already ended
  }

  public get distanceModel(): DistanceModel {
    return 'linear';
  }

  public set distanceModel(_value: DistanceModel) {
    // inert - the voice already ended
  }

  public get refDistance(): number {
    return 50;
  }

  public set refDistance(_value: number) {
    // inert - the voice already ended
  }

  public get maxDistance(): number {
    return 1000;
  }

  public set maxDistance(_value: number) {
    // inert - the voice already ended
  }

  public get rolloffFactor(): number {
    return 1;
  }

  public set rolloffFactor(_value: number) {
    // inert - the voice already ended
  }

  public get panningModel(): PanningModelType | null {
    return null;
  }

  public set panningModel(_value: PanningModelType | null) {
    // inert - the voice already ended
  }

  public get orientation(): number {
    return 0;
  }

  public set orientation(_value: number) {
    // inert - the voice already ended
  }

  public get coneInnerAngle(): number {
    return 360;
  }

  public set coneInnerAngle(_value: number) {
    // inert - the voice already ended
  }

  public get coneOuterAngle(): number {
    return 360;
  }

  public set coneOuterAngle(_value: number) {
    // inert - the voice already ended
  }

  public get coneOuterGain(): number {
    return 0;
  }

  public set coneOuterGain(_value: number) {
    // inert - the voice already ended
  }

  public get velocity(): Vector | null {
    return null;
  }

  public set velocity(_value: Vector | SpatialPoint | null) {
    // inert - the voice already ended
  }

  public get elevationVelocity(): number {
    return 0;
  }

  public set elevationVelocity(_value: number) {
    // inert - the voice already ended
  }
}
