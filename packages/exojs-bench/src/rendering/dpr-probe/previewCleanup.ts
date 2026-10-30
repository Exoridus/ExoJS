/**
 * Release everything a preview acquired after its application booted.
 *
 * Called from the failure path of `startVisualPreview`, where the scene may or
 * may not have been constructed: a throwing step must not leave the backend,
 * its GPU context, the scene's own resources or the style instrumentation
 * unreachable. Every step runs even when an earlier one throws, so the app is
 * always destroyed and the original error is what reaches the caller.
 */
export const releaseFailedPreview = (parts: {
  readonly restores: ReadonlyArray<() => void>;
  readonly disposeScene: (() => void) | null;
  readonly destroyApp: () => void;
}): void => {
  for (const undo of parts.restores) {
    try {
      undo();
    } catch {
      /* keep releasing; the app destroy must still run */
    }
  }

  if (parts.disposeScene !== null) {
    try {
      parts.disposeScene();
    } catch {
      /* the backend destroy below is the resource that must not leak */
    }
  }

  try {
    parts.destroyApp();
  } catch {
    /* the original failure is the error worth reporting */
  }
};
