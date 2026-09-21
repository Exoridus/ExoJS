import type { Application } from '@codexo/exojs';

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
