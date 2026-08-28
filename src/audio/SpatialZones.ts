import type { AudioListener } from './AudioListener';
import type { AudioSend } from './AudioSend';
import type { AudioZone } from './AudioZone';
import type { Voice } from './Playable';

/** Send level below which a zone's contribution is dropped entirely rather than left at near-silence. */
const inaudibleSend = 0.0005;

/**
 * The optional zone layer: which {@link AudioZone}s exist, and the sends they
 * currently hold open.
 *
 * Owned by {@link AudioManager} and reachable as `app.audio.zones`. Completely
 * inert until a zone is added - the per-frame tick returns immediately, so an
 * application that never uses zones pays one branch.
 *
 * Once a zone exists, each frame:
 *
 * 1. every zone's weight is sampled at the LISTENER's position, because that is
 *    where an environment is heard from;
 * 2. every audible voice gets one send per zone whose weight is above zero, at
 *    `weight * zone.send`;
 * 3. a send whose zone has faded out, or whose voice has ended, is dropped.
 *
 * Sends are opened lazily and reused across frames, so walking into a zone costs
 * one `GainNode` per voice and then nothing per frame but a level write - and the
 * level is ramped, so the boundary is a crossfade rather than a switch.
 *
 * The zone layer never owns a bus or an effect. A zone names a bus the caller
 * built; what that bus does - a convolution reverb, a lowpass, a pitch shift - is
 * entirely the caller's, and two zones may legitimately name the same one.
 * @stable
 */
export class SpatialZones {
  private readonly _zones: AudioZone[] = [];
  /** One entry per voice that currently has at least one zone send open. */
  private readonly _sends = new Map<Voice, Map<AudioZone, AudioSend>>();

  /** The zones currently registered, in the order they were added. */
  public get zones(): readonly AudioZone[] {
    return this._zones;
  }

  /** Whether any zone is registered. `false` means the per-frame tick does nothing at all. */
  public get active(): boolean {
    return this._zones.length > 0;
  }

  /** Register `zone`. Adding the same zone twice is a no-op. */
  public add(zone: AudioZone): this {
    if (!this._zones.includes(zone)) {
      this._zones.push(zone);
    }

    return this;
  }

  /**
   * Unregister `zone` and close every send it holds open.
   *
   * The zone's bus is untouched: it belongs to the caller, who may still be using
   * it for something else.
   */
  public remove(zone: AudioZone): this {
    const index = this._zones.indexOf(zone);

    if (index === -1) {
      return this;
    }

    this._zones.splice(index, 1);

    for (const [voice, byZone] of this._sends) {
      const send = byZone.get(zone);

      if (send !== undefined) {
        voice.removeSend(send);
        byZone.delete(zone);
      }

      if (byZone.size === 0) {
        this._sends.delete(voice);
      }
    }

    return this;
  }

  /** Unregister every zone and close every send. */
  public clear(): this {
    for (const zone of [...this._zones]) {
      this.remove(zone);
    }

    return this;
  }

  /**
   * Reconcile the open sends against the listener's current position.
   *
   * `voices` is the live set of spatial voices; a voice that has ended is skipped
   * and its sends released - the voice tears them down itself, so this only drops
   * the bookkeeping.
   * @internal - driven once per frame by {@link AudioManager.preUpdate}.
   */
  public _tick(listener: AudioListener, voices: Iterable<Voice>): void {
    if (this._zones.length === 0) {
      // Nothing registered and nothing left over: the common case, and the reason
      // an application that never uses zones pays nothing per frame.
      if (this._sends.size > 0) {
        this._sends.clear();
      }

      return;
    }

    const { x, y } = listener.position;
    const elevation = listener.elevation;

    for (const voice of voices) {
      if (voice.ended) {
        this._sends.delete(voice);
        continue;
      }

      this._reconcileVoice(voice, x, y, elevation);
    }
  }

  /** Drop the bookkeeping for a voice; the voice itself owns the send objects. @internal */
  public _forget(voice: Voice): void {
    this._sends.delete(voice);
  }

  private _reconcileVoice(voice: Voice, x: number, y: number, z: number): void {
    let byZone = this._sends.get(voice);

    for (const zone of this._zones) {
      const level = zone.weightAt(x, y, z) * zone.send;
      const existing = byZone?.get(zone);

      if (level <= inaudibleSend) {
        // Closed rather than left at zero: an open send is a live graph edge into
        // a shared bus, and a scene that walks past a hundred zones would keep
        // one per zone per voice alive for nothing.
        if (existing !== undefined) {
          voice.removeSend(existing);
          byZone?.delete(zone);
        }

        continue;
      }

      if (existing !== undefined) {
        existing.level = level;
        continue;
      }

      byZone ??= new Map<AudioZone, AudioSend>();
      byZone.set(zone, voice.addSend(zone.bus, level));
    }

    if (byZone === undefined) {
      return;
    }

    if (byZone.size === 0) {
      this._sends.delete(voice);
    } else {
      this._sends.set(voice, byZone);
    }
  }
}
