# Runtime-preview example scripts

These files back the live preview in the ExoJS examples site. They are loaded as static `.js` at runtime by the Astro + Lit preview frame and executed inside a Monaco-editor-backed iframe.

## Layout

- `examples.json` — metadata consumed by the navigation UI
- `shared/runtime.*` — shared runtime bootstrap used by preview scripts
- `collision-detection/`, `extras/`, `input/`, `particle-system/`, `rendering/`, `webgpu/` — category-grouped runtime scripts
