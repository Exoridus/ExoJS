import { RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { GroupScope, ScopeEntry } from '#rendering/plan/RenderScope';

/**
 * A plain {@link GroupScope} over `entries` - no mixed Z, no mixed pipeline, no
 * retained or persistent state - as the plan builder would hand one to the
 * optimizer or the player.
 *
 * The scope is mutable, so a test that needs one of the flags set writes it on
 * the returned object rather than building a second literal that would fall
 * behind the interface.
 */
export const createGroupScopeDouble = (entries: ScopeEntry[]): GroupScope => ({
  kind: RenderEntryKind.Group,
  entries,
  hasMixedZ: false,
  hasMixedPipeline: false,
  preserveDrawOrder: false,
  transformNode: null,
  retainedInstructions: null,
  persistentDraw: null,
  retainedRecordTarget: null,
});
