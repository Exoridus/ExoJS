/**
 * What a dirty frame should do with its snapshot.
 * @internal
 */
export const enum CaptureVerdict {
  /** Take the snapshot: nothing is wrong, or one wasted capture is being forgiven. */
  Capture,
  /** Thrash confirmed. The owner invalidates its product, opens the window, then skips the snapshot. */
  InvalidateAndSuppress,
  /** Already suppressed and the key is still moving: skip the snapshot. */
  Suppress,
}

/**
 * @internal
 *
 * The capture-thrash rule, written once for every tier that keeps a keyed
 * snapshot: the {@link RetainedGroupFragment} a `RetainedContainer` owns, and
 * the {@link RetainedRootRepresentation} a render root owns.
 *
 * A capture that is invalidated without ever having been replayed was pure
 * waste. One is tolerated, because a lone mutation between two replays is
 * exactly the one-shot case where recapturing immediately is the right answer.
 * The SECOND consecutive wasted capture is evidence of per-frame thrash, and
 * from then on dirty frames skip the snapshot entirely — a plain collect, the
 * cheapest dirty frame there is — until the owner's key stops moving, at which
 * point one full collect plus capture recovers the retained tier. One frame
 * late, self-correcting, no tunables.
 *
 * The KEY that "stops moving" is deliberately NOT held here. It is the one part
 * of this the two tiers genuinely disagree about: a group observes its content
 * and structure revisions, a root observes those plus its transform revision and
 * its view identity, because without the view in the tuple a panning camera over
 * a partly culled scene alternates between suppressed and recovered forever
 * instead of settling. Which channels a tier's clean-frame test spans is that
 * tier's policy; how many wasted captures buy a suppression window is not.
 */
export class CaptureThrashSuppressor {
  private _replayedSinceCapture = false;
  private _wastedCaptures = 0;
  private _suppressed = false;

  /** `true` while capture is thrash-suppressed. */
  public get suppressed(): boolean {
    return this._suppressed;
  }

  /** The active capture was replayed at least once — it earned its keep. */
  public markReplayed(): void {
    this._replayedSinceCapture = true;
  }

  /** A fresh snapshot exists; it has not earned anything yet. */
  public markCaptured(): void {
    this._replayedSinceCapture = false;
  }

  /** The owner dropped its capture: no window, no debt, no waste on record. */
  public reset(): void {
    this._replayedSinceCapture = false;
    this._wastedCaptures = 0;
    this._suppressed = false;
  }

  /**
   * Advance the machine for one DIRTY frame — the owner's clean-frame gate has
   * already failed. Call exactly once per such frame, before collecting.
   *
   * `keyUnchanged` is only read on the suppressed branch, yet is passed by value
   * rather than as a thunk: producing it is a handful of `===` compares against
   * fields the owner already holds, and a closure per dirty frame would cost
   * more than the compares it avoids.
   */
  public evaluate(hasCapture: boolean, keyUnchanged: boolean): CaptureVerdict {
    if (hasCapture) {
      if (this._replayedSinceCapture) {
        this._wastedCaptures = 0;

        return CaptureVerdict.Capture;
      }

      this._wastedCaptures++;

      if (this._wastedCaptures < 2) {
        // Grace: a single wasted capture recaptures immediately (the expected
        // behaviour for a one-shot mutation).
        return CaptureVerdict.Capture;
      }

      // Two consecutive captures invalidated without a single replay: thrash.
      // The owner's invalidation runs {@link reset}, which is why the window is
      // opened by a separate {@link suppress} call afterwards rather than here.
      return CaptureVerdict.InvalidateAndSuppress;
    }

    if (this._suppressed && keyUnchanged) {
      // The key stopped moving: this frame would have been clean if a capture
      // existed. Recover the retained tier now.
      this._suppressed = false;

      return CaptureVerdict.Capture;
    }

    return this._suppressed ? CaptureVerdict.Suppress : CaptureVerdict.Capture;
  }

  /** Open the suppression window, after the owner has invalidated its product. */
  public suppress(): void {
    this._suppressed = true;
  }
}
