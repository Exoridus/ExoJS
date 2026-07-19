import type { Drawable } from '#rendering/Drawable';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';

import { drawableHasOwnMaterial, RenderEntryKind } from './RenderCommand';
import type { RetainedFragmentEntry } from './RetainedGroupFragment';

/**
 * Discriminant for the retained instruction stream (Track B Slice 3, S3-D1).
 * @internal
 */
export const enum RetainedInstructionKind {
  /** One recorded renderer flush: replayed as a single instanced draw. */
  Batch,
  /** Enter a nested transform-group boundary (live node, composed at play). */
  EnterGroup,
  /** Leave the innermost entered group. */
  LeaveGroup,
}

/**
 * Backend-owned GPU resource bundle for one retained group (S3-D3): the
 * group's persistent instance buffer, transform store, and per-batch
 * VAOs/bind groups live behind this handle. The plan layer only reads the
 * generation counter — bumped whenever the backend recreates or destroys the
 * bundle's resources (device restore, growth reallocation, destroy) — to
 * reject instruction sets that reference stale GPU state.
 * @internal
 */
export interface RetainedGroupBundle {
  /** Monotonic resource generation; a mismatch invalidates referencing sets. */
  readonly generation: number;
  /**
   * The shared frame-buffer row the stored transform rows were rebased from
   * (Slice 4b). A group-local row is `capturedNodeIndex - transformRowBase`.
   * Absent on backends that do not implement in-place transform patching.
   */
  readonly transformRowBase?: number;
  /**
   * Slice 4b fast patch: overwrite one group-local transform row in place with
   * `floats` (12 = 3 rgba32f texels, the `TransformBuffer` row layout) and mark
   * only its sub-range for upload, WITHOUT bumping the generation (the recorded
   * instance bytes reference the row by index and stay valid). Absent on
   * backends without patch support — the caller then falls back to entry replay
   * (which re-reads live transforms) or a re-record.
   */
  _patchTransformRow?(localRow: number, floats: Float32Array): void;
  /** Release the bundle's GPU resources (container destroy / disengage). */
  destroy?(): void;
}

/**
 * One recorded renderer flush inside a retained group (S3-D1). The
 * backend-specific descriptor (pipeline/blend, texture list, byte
 * offset/length into the group instance buffer, cached bind groups, ...)
 * lives in `payload`, owned by the backend that recorded it; the plan layer
 * carries only what validation (bundle + generation) and stats parity
 * (instanceCount/drawCalls) need.
 * @internal
 */
export interface RetainedBatchInstruction {
  readonly kind: RetainedInstructionKind.Batch;
  /** The bundle whose buffers this batch references (may belong to an inner group, S3-D6). */
  readonly bundle: RetainedGroupBundle;
  /** `bundle.generation` at record time; a mismatch means stale GPU state. */
  readonly generation: number;
  /** Instances drawn by this batch (stats: submittedNodes). */
  readonly instanceCount: number;
  /** GPU draw calls issued by this batch (stats: drawCalls). */
  readonly drawCalls: number;
  /** Backend-owned replay descriptor, opaque to the plan layer. */
  readonly payload: unknown;
}

/**
 * Marker: the following batches belong to the nested transform group rooted
 * at `node`. The player composes `node.getGlobalTransform()` onto the active
 * group matrix at REPLAY time (existing scratch-matrix logic) — the matrix is
 * never captured, so nested group moves stay one-matrix-cheap (S3-D6).
 * @internal
 */
export interface RetainedEnterGroupInstruction {
  readonly kind: RetainedInstructionKind.EnterGroup;
  readonly node: RenderNode;
}

/** Marker: leave the innermost entered nested group. @internal */
export interface RetainedLeaveGroupInstruction {
  readonly kind: RetainedInstructionKind.LeaveGroup;
}

/** @internal */
export type RetainedInstruction = RetainedBatchInstruction | RetainedEnterGroupInstruction | RetainedLeaveGroupInstruction;

/**
 * Shared LeaveGroup marker — the instruction carries no state, so every
 * append reuses this frozen singleton.
 * @internal
 */
export const retainedLeaveGroupInstruction: RetainedLeaveGroupInstruction = Object.freeze({ kind: RetainedInstructionKind.LeaveGroup });

/**
 * Sentinel for {@link RetainedBatchInstruction.generation} on a batch whose
 * capture has not been finalized yet. Out of the generation domain (bundle
 * generations start at 1 and only grow), so a set whose capture never reached
 * finalization — device loss mid-capture, an aborted playback — can never
 * pass {@link RetainedInstructionSet.isValidFor}.
 * @internal
 */
export const retainedGenerationUnstamped = -1;

/**
 * Stamp `instruction.generation` with its bundle's CURRENT generation — the
 * one sanctioned mutation point of the otherwise readonly field (S3-D3).
 *
 * Why stamping exists: group GPU resources are grow-only and (re)created at
 * CAPTURE END (finalization), and every recreation bumps the bundle
 * generation. A batch instruction created at flush time therefore cannot know
 * its final generation yet — backends create it with
 * {@link retainedGenerationUnstamped} and call this once per recorded batch
 * after the bundle's resources are final. Deliberately per-instruction:
 * poison instructions (a forced generation mismatch that permanently vetoes a
 * set) are simply never stamped.
 * @internal
 */
export const stampRetainedBatchGeneration = (instruction: RetainedBatchInstruction): void => {
  (instruction as { generation: number }).generation = instruction.bundle.generation;
};

/**
 * The recorded flush-level batch list for one retained group (Track B
 * Slice 3, S3-D1/S3-D3): what the group's playback produced at renderer-flush
 * granularity, replayable in O(batches) instead of O(nodes). Owned by the
 * group's {@link RetainedGroupFragment}; its validity is additionally gated by
 * the fragment's revision key at collect time — this class only checks what
 * the fragment cannot: backend identity and per-batch resource generations.
 *
 * Everything view- or group-transform-dependent is resolved live at replay
 * (S3-D1): the set stores batches and group markers, never matrices.
 */
export class RetainedInstructionSet {
  private readonly _instructions: RetainedInstruction[] = [];
  private _backend: RenderBackend | null = null;
  private _hasRecording = false;
  private _recording = false;
  /**
   * The bundle owned by THIS group (assigned by the backend at capture;
   * batches may additionally reference inner groups' bundles, S3-D6).
   * Grow-only across recaptures; destroyed via {@link dispose}.
   */
  public ownedBundle: RetainedGroupBundle | null = null;

  public get instructions(): readonly RetainedInstruction[] {
    return this._instructions;
  }

  public get hasRecording(): boolean {
    return this._hasRecording;
  }

  public get isRecording(): boolean {
    return this._recording;
  }

  /** Start a fresh recording for `backend`, dropping any previous one. */
  public beginRecording(backend: RenderBackend): void {
    this._instructions.length = 0;
    this._backend = backend;
    this._hasRecording = false;
    this._recording = true;
  }

  /**
   * Append an instruction to the active recording. Batches are appended by
   * the backend at flush time; group markers by the plan player; replayed
   * inner-set instructions verbatim by the player (S3-D6). Ignored when no
   * recording is active (a backend flush outside any capture window).
   */
  public append(instruction: RetainedInstruction): void {
    if (!this._recording) {
      return;
    }

    this._instructions.push(instruction);
  }

  /** Seal the recording; the set becomes eligible for replay validation. */
  public commitRecording(): void {
    this._recording = false;
    this._hasRecording = true;
  }

  /** Abandon an in-flight recording (exception unwind): the set stays invalid. */
  public abortRecording(): void {
    this._recording = false;
    this._hasRecording = false;
    this._instructions.length = 0;
  }

  /**
   * Drop the recording (fragment recapture/invalidation). Deliberately keeps
   * {@link ownedBundle}: GPU resources are grow-only per group and reused by
   * the next recording (S3-D3 — no realloc churn under motion-stop/start).
   */
  public invalidate(): void {
    this._hasRecording = false;
    this._recording = false;
    this._instructions.length = 0;
  }

  /** Release the owned GPU bundle AND the recording (destroy/disengage). */
  public dispose(): void {
    this.invalidate();
    this.ownedBundle?.destroy?.();
    this.ownedBundle = null;
  }

  /**
   * Replay-eligibility check at collect time (S3-D3). The caller has already
   * verified the owning fragment is clean (revision key); this validates the
   * rest: a committed recording, the same backend identity, and a live
   * resource generation for every referenced bundle (covers inner-group
   * recapture races, device restore, and backend-side eviction). Backend-
   * specific validation (e.g. WebGPU texture-view identity) happens in the
   * backend's own collect-time hook on top of this.
   */
  public isValidFor(backend: RenderBackend): boolean {
    if (!this._hasRecording || this._recording || this._backend !== backend) {
      return false;
    }

    for (const instruction of this._instructions) {
      if (instruction.kind === RetainedInstructionKind.Batch && instruction.bundle.generation !== instruction.generation) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Structural capability flag for renderers that support flush-level batch
 * recording (S3-D5.1). v1 opt-in: the sprite renderers' default path only —
 * the concrete backends set `_supportsRetainedBatches = true` on their sprite
 * renderers when they implement the record/replay hooks (Tasks 6/9). Same
 * structural-flag convention as `_consumesSharedTransform`.
 * @internal
 */
export interface RetainedBatchCapableRenderer {
  readonly _supportsRetainedBatches?: boolean;
}

interface BackendWithRendererRegistry {
  readonly rendererRegistry?: {
    resolve(drawable: Drawable): unknown;
  };
}

/**
 * The v1 recordability predicate (S3-D5): a captured fragment can be recorded
 * as an instruction set iff every captured draw uses a renderer that opts in
 * via {@link RetainedBatchCapableRenderer}, has no own material (custom
 * uniforms re-upload live at flush and their mutation bumps no revision), and
 * does not pixel-snap (snapped instance words are view-dependent); and no
 * barrier record exists anywhere in the fragment (barriers re-dispatch live
 * per frame and cannot interleave with cached batch runs, S3-D5.4). Nested
 * plain/retained groups recurse. Anything non-recordable stays on the
 * Slice-2 entry-replay tier — correct, just not batch-cached.
 * @internal
 */
export const isRetainedFragmentRecordable = (entries: readonly RetainedFragmentEntry[], backend: RenderBackend): boolean => {
  const registry = (backend as BackendWithRendererRegistry).rendererRegistry;

  if (!registry || typeof registry.resolve !== 'function') {
    return false;
  }

  return entriesRecordable(entries, registry);
};

const entriesRecordable = (entries: readonly RetainedFragmentEntry[], registry: NonNullable<BackendWithRendererRegistry['rendererRegistry']>): boolean => {
  for (const entry of entries) {
    if (entry.kind === RenderEntryKind.Barrier) {
      return false;
    }

    if (entry.kind === RenderEntryKind.Group) {
      if (!entriesRecordable(entry.entries, registry)) {
        return false;
      }

      continue;
    }

    const drawable = entry.drawable;

    if (drawableHasOwnMaterial(drawable) || drawable.pixelSnapMode !== PixelSnapMode.None) {
      return false;
    }

    let renderer: RetainedBatchCapableRenderer | null;

    try {
      renderer = registry.resolve(drawable) as RetainedBatchCapableRenderer | null;
    } catch {
      // No renderer registered for a custom drawable: not recordable.
      return false;
    }

    if (renderer === null || typeof renderer !== 'object' || renderer._supportsRetainedBatches !== true) {
      return false;
    }
  }

  return true;
};
