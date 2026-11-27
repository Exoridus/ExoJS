/**
 * Contact-shadow expectations for the lightmap renderer, run by the WebGL2 and
 * WebGPU lanes alike: the clearance that keeps a lit face lit must not open a
 * gap behind a wall, whatever the light's reach or the camera's scale.
 */

import { describe, expect, test } from 'vitest';

import { type ContactBackend, type ContactLight, type ContactProfile, type ContactScene, measureContact } from './_lightmapContact';

/** A sixteen-unit view at 256 pixels, with a wall six units from the light. */
const contact = (light: ContactLight): ContactScene => ({ light, pixelsPerUnit: 16, distance: 6, radius: 16 });

/**
 * Lit in front of the wall, dark from `maxEdge` pixels behind it on. The edge
 * of a hard shadow lands inside the fragment the wall crosses, so the term at
 * one and a half fragments behind is already the shadow itself.
 */
const expectContact = (profile: ContactProfile, maxEdge = 1.5): void => {
  expect(profile.front).toBeGreaterThan(0.95);
  expect(profile.near).toBeGreaterThan(0.9);
  expect(profile.edge).toBeLessThanOrEqual(maxEdge);
  expect(profile.behind).toBeLessThan(0.05);
};

export const describeLightmapContact = (backend: ContactBackend): void => {
  /** `null` when the device was dropped, which the caller skips. */
  const measure = async (scene: ContactScene): Promise<ContactProfile | null> => measureContact(backend, scene);

  describe('lightmap contact shadows', () => {
    test.each<ContactLight>(['point', 'spot', 'line', 'sun'])('a %s light leaves no gap behind the wall it touches', async light => {
      const profile = await measure(contact(light));

      if (profile === null) {
        return;
      }

      expectContact(profile);
      // Half a world unit behind the wall is eight pixels at this scale.
      expect(profile.contact).toBeLessThan(0.1);
    });

    test('a thin closed wall still casts from its lit face', async () => {
      const profile = await measure({ ...contact('point'), thickness: 1 / 64 });

      if (profile !== null) {
        expectContact(profile);
      }
    });

    test('the clearance follows the fragment rather than the light reach', async () => {
      // A reach of 2048 seen up close: a tolerance in radii would light eight
      // world units, 32 pixels, of the shadow behind the wall.
      const close = await measure({ light: 'point', pixelsPerUnit: 4, distance: 24, radius: 2048 });
      // A small light seen from far out: one world unit is half a pixel.
      const far = await measure({ light: 'point', pixelsPerUnit: 0.5, distance: 24, radius: 64 });

      if (close === null || far === null) {
        return;
      }

      expectContact(close);
      expectContact(far);
    });

    test('a turned camera, a coarser light target and a soft edge keep the contact', async () => {
      const turned = await measure({ ...contact('point'), rotation: 30 });
      // One light texel is two output pixels here, and the composite filters
      // across it.
      const coarse = await measure({ ...contact('spot'), lightResolution: 0.5 });
      const soft = await measure({ ...contact('line'), softness: 0.5, shadowResolution: 64 });

      if (turned === null || coarse === null || soft === null) {
        return;
      }

      expectContact(turned);
      expectContact(coarse, 2.5);
      expectContact(soft);
    });

    test('the marched rows keep the lit face lit where their half floats round', async () => {
      // Far enough along a reach that is no power of two from the step that
      // the stored distance rounds by close to a whole mask texel, with the
      // wall through pixel centres so that the rounding lands on the face.
      const deep = await measure({
        light: 'point',
        filler: 'gpu',
        pixelsPerUnit: 1.7,
        distance: 1150,
        radius: 1300,
        intensity: 60,
        offset: 0.5,
      });
      const near = await measure({ ...contact('point'), filler: 'gpu' });

      // Without a float render target the request falls back to the walked
      // rows, which other cases already cover.
      if (deep === null || near === null || deep.filler !== 'gpu') {
        return;
      }

      expectContact(deep, 2.5);
      expectContact(near);
    });
  });
};
