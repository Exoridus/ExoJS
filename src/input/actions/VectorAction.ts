import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';
import { Vector } from '#math/Vector';

import type { GamepadSlot } from './ActionBase';
import { ActionBase, channelsFromTokens, tokensFromChannels } from './ActionBase';
import type { SerializedActionBinding, SerializedVectorEntry } from './serialization';
import type { ActionOptions, ActionSample, AtLeastOne, OneOrMany } from './types';
import { sampleStrongest, toChannels } from './types';

/**
 * Sources for one two-dimensional binding. `x`/`y` take directly signed
 * sources (stick axes); `up`/`down`/`left`/`right` take button groups. Both
 * forms may appear in the same binding — per axis, whichever of the two
 * deflects further wins.
 */
export interface VectorBindingShape {
  readonly x?: OneOrMany<InputChannel>;
  readonly y?: OneOrMany<InputChannel>;
  readonly up?: OneOrMany<InputChannel>;
  readonly down?: OneOrMany<InputChannel>;
  readonly left?: OneOrMany<InputChannel>;
  readonly right?: OneOrMany<InputChannel>;
}

/** A two-dimensional binding with at least one source. */
export type VectorBinding = AtLeastOne<VectorBindingShape>;

type ResolvedVectorBinding = Record<keyof VectorBindingShape, readonly number[]>;

const vectorFields = ['x', 'y', 'up', 'down', 'left', 'right'] as const;

function resolveVectorBinding(binding: VectorBinding, slot: GamepadSlot): ResolvedVectorBinding {
  const rebase = (source: OneOrMany<InputChannel> | undefined): readonly number[] =>
    toChannels(source).map(channel => resolveGamepadSlotChannel(channel, slot));

  const shape = binding as VectorBindingShape;

  return {
    x: rebase(shape.x),
    y: rebase(shape.y),
    up: rebase(shape.up),
    down: rebase(shape.down),
    left: rebase(shape.left),
    right: rebase(shape.right),
  };
}

function serializeEntry(binding: ResolvedVectorBinding): SerializedVectorEntry {
  const entry: Record<string, readonly string[]> = {};

  for (const field of vectorFields) {
    if (binding[field].length > 0) {
      entry[field] = tokensFromChannels(binding[field]);
    }
  }

  return entry;
}

function deserializeEntry(entry: unknown): VectorBinding {
  if (entry === null || typeof entry !== 'object') {
    throw new Error('VectorAction: every serialized binding entry must be an object.');
  }

  const source = entry as Record<string, unknown>;
  const shape: Record<string, readonly InputChannel[]> = {};

  for (const field of vectorFields) {
    if (source[field] !== undefined) {
      shape[field] = channelsFromTokens(source[field], `a vector "${field}" group`);
    }
  }

  if (Object.keys(shape).length === 0) {
    throw new Error('VectorAction: a serialized binding entry needs at least one of x, y, up, down, left, right.');
  }

  return shape as VectorBinding;
}

/** Combine a directly signed source with an opposing button pair, strongest deflection winning. */
function evaluateAxis(buffer: Float32Array, direct: readonly number[], negative: readonly number[], positive: readonly number[]): number {
  const axis = sampleStrongest(buffer, direct);
  const composite = Math.abs(sampleStrongest(buffer, positive)) - Math.abs(sampleStrongest(buffer, negative));

  return Math.abs(axis) >= Math.abs(composite) ? axis : composite;
}

/**
 * A named two-dimensional input, fed by a stick, by four direction buttons, or
 * by several such bindings at once.
 *
 * Each alternative binding is evaluated as a whole vector and the longest one
 * wins, so x never comes from the keyboard while y comes from the pad. The
 * result is clamped to unit length rather than normalized: a digital diagonal
 * is no faster than a cardinal direction, while analog input below full
 * deflection keeps its magnitude.
 *
 * @example
 * ```ts
 * const move = new VectorAction([
 *   { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
 *   { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
 * ]);
 * ```
 */
export class VectorAction extends ActionBase<OneOrMany<VectorBinding>> {
  public override readonly kind = 'vector' as const;

  /** Current vector. The same instance every frame — copy it if you need to retain a value. */
  public readonly value = new Vector();

  private _bindings: readonly ResolvedVectorBinding[] = [];
  private readonly _threshold: number;

  public constructor(binding: OneOrMany<VectorBinding>, options: ActionOptions = {}) {
    super(binding);
    this._threshold = options.threshold ?? 0;
    this._rebind(null, 0);
  }

  /** `true` while the vector's length exceeds the action's threshold. */
  public get active(): boolean {
    const { x, y } = this.value;

    return Math.sqrt(x * x + y * y) > this._threshold;
  }

  public override serialize(): SerializedActionBinding {
    return { kind: 'vector', binding: this._bindings.map(serializeEntry) };
  }

  /** @internal */
  public override _deserialize(data: SerializedActionBinding): OneOrMany<VectorBinding> {
    if (data.kind !== 'vector') {
      throw new Error(`VectorAction: cannot apply a "${data.kind}" binding.`);
    }

    if (!Array.isArray(data.binding)) {
      throw new Error('VectorAction: a serialized vector binding must be an array of entries.');
    }

    return (data.binding as readonly unknown[]).map(deserializeEntry);
  }

  protected override _resolve(binding: OneOrMany<VectorBinding>, slot: GamepadSlot): void {
    const list = Array.isArray(binding) ? (binding as readonly VectorBinding[]) : [binding as VectorBinding];

    this._bindings = list.map(entry => resolveVectorBinding(entry, slot));
    this._channels = [...new Set(this._bindings.flatMap(entry => vectorFields.flatMap(field => entry[field])))];
  }

  /**
   * Sample the channel buffers for this frame. A vector has no
   * frame-to-frame edge memory to protect, unlike {@link ButtonAction} — a
   * suspend/resume cycle or an ownership handoff is just a normal sample, so
   * there is nothing more to decide here.
   *
   * @internal
   */
  public override _update(sample: ActionSample): void {
    const { values } = sample;
    let winnerX = 0;
    let winnerY = 0;
    let winnerLength = 0;

    for (const binding of this._bindings) {
      const x = evaluateAxis(values, binding.x, binding.left, binding.right);
      const y = evaluateAxis(values, binding.y, binding.up, binding.down);
      const length = Math.sqrt(x * x + y * y);

      if (length > winnerLength) {
        winnerX = x;
        winnerY = y;
        winnerLength = length;
      }
    }

    if (winnerLength > 1) {
      winnerX /= winnerLength;
      winnerY /= winnerLength;
    }

    this.value.set(winnerX, winnerY);
  }

  /** Clear all state, as if no source had ever been touched. @internal */
  public override _reset(): void {
    this.value.set(0, 0);
  }
}
