/**
 * Smoke-test: verifies that a real WebGL2RenderingContext can be obtained
 * in a headless Chromium environment via Playwright/SwiftShader.
 *
 * This test intentionally does NOT use any ExoJS code - it validates the
 * test infrastructure itself (SwiftShader software renderer is active).
 */
describe('WebGL2 context availability', () => {
  const contexts: WebGL2RenderingContext[] = [];

  afterEach(() => {
    for (const gl of contexts) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }

    contexts.length = 0;
  });
  test('canvas.getContext("webgl2") returns a real WebGL2RenderingContext', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');

    if (gl !== null) {
      contexts.push(gl);
    }

    expect(gl).not.toBeNull();
    expect(gl).toBeInstanceOf(WebGL2RenderingContext);
  });

  test('WebGL2 context reports a valid renderer string', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');

    if (gl !== null) {
      contexts.push(gl);
    }

    expect(gl).not.toBeNull();

    const ext = gl!.getExtension('WEBGL_debug_renderer_info');

    if (ext) {
      const renderer = gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      expect(typeof renderer).toBe('string');
      expect(renderer.length).toBeGreaterThan(0);
    }
  });

  test('basic WebGL2 operations complete without throwing', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const gl = canvas.getContext('webgl2');

    if (gl !== null) {
      contexts.push(gl);
    }

    expect(gl).not.toBeNull();

    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    expect(gl!.getError()).toBe(gl!.NO_ERROR);
  });
});
