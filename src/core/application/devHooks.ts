import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';

/**
 * Fires once for every {@link Application} that finishes starting up, for
 * tooling that does not own the application it wants to reach: a devtools
 * panel, an inspector overlay, a probe script driving a page it did not write.
 *
 * Dispatched from {@link Application.start} once the render backend is
 * initialized and {@link Application.capabilities} has settled, and before the
 * initial scene navigation - so a listener is attached in time to observe the
 * first scene load. An application that is constructed but never started never
 * reaches this point and is never announced. Each application is announced at
 * most once, however often it is stopped and started again.
 *
 * **Development builds only.** The dispatch is compiled out of production
 * builds, where this signal therefore never fires. The signal object itself
 * still exists, so importing it is safe in any build - it simply stays silent.
 *
 * This is the engine's one deliberate process-wide hook, and it exists for
 * tooling rather than for application code: an application that wants to know
 * about its own startup already has `await app.start()`. It is a notification,
 * **not** a registry - nothing here holds a list of live applications, so a
 * listener added after an application started will not hear about it.
 *
 * A handler must not retain the application beyond its
 * {@link Application.destroy}: what is handed out is a live instance, and
 * keeping it alive past its teardown pins its backend, loader and audio
 * context with it. Hold what you need from it, or drop the reference when the
 * application goes down.
 *
 * ```ts
 * import { onAppInitialized } from '@codexo/exojs';
 *
 * onAppInitialized.add(app => {
 *   console.log(`ExoJS running on ${app.backend.backendType}`);
 * });
 * ```
 */
export const onAppInitialized = new Signal<[app: Application]>();
