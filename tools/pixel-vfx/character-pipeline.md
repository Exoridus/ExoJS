# Character sprite pipeline evaluation

## Status and proposed tool choice

Research checked on 2026-11-03. Ten supplied screenshots show two characters, but no GLB, glTF, FBX, BLEND or OBJ source files were available locally. No character import, rig inspection, animation playback, render or sprite export has been performed. Neither Blender nor PixelOver was available on the evaluation environment's PATH. This document specifies a test procedure; it does not establish a working character pipeline.

Use Blender to inspect and prepare the original models, then compare direct GLB import into PixelOver with Blender-rendered PNG sequences processed in PixelOver. The recommended pinned baseline is [Blender 5.2.3 LTS](https://www.blender.org/releases/5-2/), the latest published 5.2 LTS update at the research date. It was not installed or executed for this evaluation. [PixelOver 0.19.3](https://deakcor.itch.io/pixelover/devlog/1735170/pixelover-0193-copy-transform-constraint) was released on 2026-10-28; record the actual installed version before testing.

## Documented capabilities

| Area                  | PixelOver                                                                                                                                                                                                                       | Blender                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input                 | [GLB/glTF, FBX, DAE and BLEND scenes](https://docs.pixelover.io/manual/import/); OBJ/VOX models; PNG image sequences.                                                                                                           | Official documentation covers [glTF animation import](https://docs.blender.org/manual/nl/5.2/addons/scene_gltf2.html) and [FBX import](https://docs.blender.org/manual/de/5.2/files/import_export/fbx.html). Import fidelity still needs testing with these assets. |
| Rig and animation     | [Editing imported bone poses](https://docs.pixelover.io/tutorials/edit_3dmodel_bones_pose/) requires an already rigged scene. Imported animation overrides and IK are documented. This is not evidence of automatic 3D rigging. | Inspect armatures, weights and clips before rendering. glTF transfers supported object, bone and shape-key animation; arbitrary physics or material animation is not interchangeable.                                                                               |
| Views                 | [Orthographic camera and automatic directional export](https://docs.pixelover.io/tutorials/first_steps3d/), including eight directions.                                                                                         | [Orthographic camera](https://docs.blender.org/manual/nl/5.2/render/cameras.html) with fixed scale; directional rendering needs a prepared scene or script.                                                                                                         |
| Pixel treatment       | [Palette indexing, dithering, outlines, normal/depth lines and binary transparency](https://docs.pixelover.io/manual/shader/).                                                                                                  | Render controlled inputs; a pixel treatment and packing stage still needs definition.                                                                                                                                                                               |
| Output and automation | [PNG sheets, GIF, Aseprite and optional frame JSON](https://docs.pixelover.io/manual/export/). Export requires the paid version. No official CLI, headless mode or scripting API was verified.                                  | [Background rendering](https://docs.blender.org/manual/id/5.2/advanced/command_line/render.html) and [Python execution](https://docs.blender.org/api/5.2/info_overview.html) are documented. No character batch script or prepared scene is supplied here.          |

PixelOver's [0.18.4 release notes](https://deakcor.itch.io/pixelover/devlog/1577436/pixelover-0184-export-control-update) document rotation around up to three axes, although the export manual still mentions only Y-axis rotation. Use one vertical-axis turn for gameplay directions. Exporting multiple animations through the GUI does not establish command-line automation; the [roadmap](https://pixelover.io/roadmap/) still lists a lighter project type for batch pixelation as planned work.

## Character evidence and risks

These are screenshot observations, not mesh findings.

The female engineer has pale asymmetric hair with a dark shaved side, a cropped cream jacket with red collar and cuffs, dark shorts, exposed legs, long red/petrol cloth panels, tall boots and a prominent brass forearm instrument. Her light hair, red accents and open leg silhouette are useful identifiers. Cloth panels may obscure the legs in some views; small patterns, hair tips and instrument details may become unstable pixels.

The male character has dark asymmetric hair with a pale streak, a cream jacket with petrol collar, a diagonal leather strap, broad dark trousers, large pockets, a round brass belt instrument and a hanging petrol panel. His heavier leg silhouette distinguishes him. The pale streak and small buckles may disappear; trousers, gloves, belt and boots need distinct value groups to avoid one dark mass.

Both share cream, leather brown, brass and petrol. Preserve these large color relationships before trying to retain seams or ornament. Screenshots do not prove topology quality, separate cloth geometry, texture completeness, alpha materials, bones, skin weights or usable animation clips. Those remain inspection tasks.

## Repeatable test procedure

### 1. Inspect the original exports

Record input hashes, file formats, model orientation, scale, meshes, materials, textures, armatures and clip names. Check missing resources and pose deformation at shoulders, elbows, hips and knees. Inspect the cloth panels and attached instruments during motion. Rigging, weight correction, clip creation and material repair are manual work when required; decide whether retopology is necessary only after inspecting the actual geometry.

### 2. Establish a fixed render setup

Choose the intended game camera elevation and orthographic projection. Establish a common floor plane and stable actor origin. Keep camera, lighting, exposure, color conversion and actor scale fixed across frames. Disable motion blur and depth of field. Use [transparent PNG RGBA output](https://docs.blender.org/manual/en/latest/render/eevee/render_settings/film.html).

Calibrate each target height from the same reference pose, then lock its framing. Size the canvas for the maximum pose and cloth extent plus padding. Keep a fixed floor/pivot coordinate across every direction and clip. Do not fit or recenter each frame independently. If frames are trimmed later, preserve their offsets relative to the original canvas.

### 3. Compare native visible heights

Render each size directly; do not derive the smaller tests by shrinking a larger sprite. Visible character height is separate from sprite-cell size.

| Visible height | Expected risk from the screenshots                                                       | Test purpose                                                     |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 64 px          | Face, shaved side, streak and equipment details may collapse; cloth and limbs may merge. | Establish whether deliberate simplification can retain identity. |
| 96 px          | More room for hair, collars and instruments, with fine ornament still vulnerable.        | Recommended first candidate, subject to the actual comparison.   |
| 128 px         | Better separation of details, but more texture noise may survive.                        | Check whether extra resolution materially improves identity.     |

The initial matrix is **2 characters x 3 heights x 8 directions = 48 stills**. Render real views at 45-degree intervals and document their compass mapping. A four-direction set can select the four cardinal views. Do not mirror directions: hair, straps, cloth and equipment are asymmetric. Inspect at native 1x and nearest-neighbor 2x on light, dark and representative game backgrounds.

### 4. Check motion conditionally

After selecting a height, sample several phases of existing idle and walk clips. Include a wider arm pose to expose instrument and cloth problems. If clips or a usable rig are absent, record the missing work before continuing; screenshots cannot supply animation. Play complete loops before approval: sampled frames cannot establish timing, foot sliding or loop continuity.

Look for clipping, changing floor offsets, unintended intersections, disappearing identity features and flickering highlights. Avoid exporting a duplicate loop endpoint.

### 5. Compare the two PixelOver paths

For direct import, load the prepared GLB and verify materials, clips, camera and orientation. For the alternative, render identical views in Blender and import their PNG sequences into PixelOver. This separates rendering compatibility from pixel treatment. Background automation should only be added after a real prepared scene works and its settings are documented.

Use one fixed palette across characters, directions and clips. PixelOver's [indexation workflow](https://docs.pixelover.io/tutorials/use_indexation/) supports generated or imported palettes and subsequent edits. Start without dithering; compare a restrained pattern only if needed. Simplify noisy material detail before increasing effects. Deterministic processing does not guarantee temporal stability: contours, highlights and palette thresholds can still change during motion.

Export a small sheet and inspect frame order, transparency, dimensions and durations. Record direction mapping and floor/pivot metadata explicitly; the documented PixelOver JSON schema does not establish a pivot field. Repeat the export and compare decoded image data. Successful import and a plausible still are insufficient evidence of a production-ready animation set.

## Required inputs and provenance

The next executable step requires both original GLB or FBX exports, any external textures, and separate rig/animation files if applicable. Also establish the intended camera angle, game scale and required clips. Blender must be installed; a full PixelOver export test requires the paid application.

Obtain the original exports from the asset owner. Preserve their export metadata and provenance. Tripo's applicable account, generation and export terms have not been verified, and screenshot access does not establish redistribution rights. Confirm intended use before publishing derivatives; do not add the source models or textures to the repository by default. This evaluation provides no license or permission to redistribute them.
