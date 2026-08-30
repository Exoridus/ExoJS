import type { RetainedInstructionSet } from '#rendering/plan/RetainedInstructionSet';

import type { WebGpuStagedRetainedBatch } from './retainedGroupResources';
import type { WebGpuRetainedGroupBundle } from './WebGpuRetainedGroupBundle';

/**
 * Active capture window for one retained group (stacked for nesting):
 * batches flushed while this frame is on the backend's stack are staged here
 * (bytes stored once, owned by the INNERMOST frame's bundle) and their
 * instructions appended to every active set.
 * @internal
 */
export class WebGpuRetainedCaptureFrame {
  public readonly set: RetainedInstructionSet;
  public readonly bundle: WebGpuRetainedGroupBundle;
  public readonly staged: WebGpuStagedRetainedBatch[] = [];
  public totalBytes = 0;
  /**
   * Set when playback inside the window issued work the recorder cannot
   * replay (non-recordable renderer or compositor). Should be
   * unreachable - the collect-time recordability predicate excludes
   * all of it - but wrong pixels are never an acceptable failure mode, so a
   * poisoned window is dropped and its set permanently vetoed.
   */
  public poisoned = false;

  public constructor(set: RetainedInstructionSet, bundle: WebGpuRetainedGroupBundle) {
    this.set = set;
    this.bundle = bundle;
  }
}
