import type { Application, Scene } from '@codexo/exojs';

/**
 * What a lighting system needs of the application whose frame it lights.
 *
 * A renderer that composes the frame reads the drawn frame, installs its passes
 * in the frame slot, lays its fields out over the camera's view and follows the
 * surface when it resizes. Those six members are the whole of it, so an
 * {@link Application} satisfies this structurally and a test host can satisfy
 * it without standing in for an application.
 *
 * The system is handed one; it never owns or destroys it.
 */
export type LightingHost = Pick<Application, 'rendering' | 'frameTexture' | 'framePasses' | 'width' | 'height' | 'onResize'>;

/**
 * What a lighting system needs of the scene it belongs to: its state, and the
 * lifecycle signals that move it into and out of the host's frame. A
 * {@link Scene} satisfies this structurally. See {@link LightingOptions.scene}.
 *
 * The system only listens; it never drives or destroys the scene.
 */
export type LightingScene = Pick<Scene, 'state' | 'onActivate' | 'onSuspend' | 'lifecycleSignal'>;
