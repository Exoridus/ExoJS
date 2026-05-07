# Performance Baseline — 0.7.10

Captured on 2026-05-07 · Node.js v24.14.1 · Windows 11 Pro (x64).

All numbers are wall-clock milliseconds measured in Node.js (no GPU, no real
audio output). The harness runs each scenario for the stated number of
iterations and reports average, min, and max per iteration.

---

## Rendering

CPU-side traversal and culling cost (8 000–6 000 node scenes, 240 frames).

| Scenario               | Frames | Nodes | Avg Frame ms | Avg Drawn | Avg Culled |
| ---------------------- | -----: | ----: | -----------: | --------: | ---------: |
| dense-visible          |    240 |  8000 |       0.6296 |      1271 |       6729 |
| dense-mostly-offscreen |    240 |  8000 |       0.4472 |         0 |       8000 |
| camera-pan             |    240 |  6000 |        0.352 |       900 |       5100 |

---

## Audio

Main-thread JavaScript overhead (no real audio output, mocked AudioContext).

| Scenario                    | Iterations | Avg ms | Min ms | Max ms |
| --------------------------- | ---------: | -----: | -----: | -----: |
| many-sounds-play            |        240 | 0.1493 | 0.0947 | 2.1036 |
| audio-manager-update        |        240 | 0.0007 | 0.0003 | 0.0527 |
| filter-chain-build-teardown |        100 | 0.0326 | 0.0218 | 0.2758 |
| spatial-sound-tick          |        240 | 0.0041 | 0.0009 | 0.1272 |
| audio-listener-tick         |        240 | 0.0028 | 0.0007 | 0.0827 |

---

## Collision

Pure CPU math — SAT, circle tests, quadtree, swept AABB.

| Scenario             | Iterations |  Avg ms |  Min ms |  Max ms |
| -------------------- | ---------: | ------: | ------: | ------: |
| sat-polygon-pairs-1k |         60 |  5.7855 |  5.4699 | 12.4031 |
| circle-circle-10k    |         30 |  0.4648 |  0.1725 |  2.2973 |
| quadtree-build-1k    |        120 |  0.2373 |  0.1528 |  2.8813 |
| quadtree-query-10k   |         30 | 13.1259 | 11.9929 | 18.9718 |
| swept-rect-1k        |        120 |  0.0644 |  0.0306 |  0.5271 |

---

## Scene-Graph

Container / SceneNode operation cost.

| Scenario                   | Iterations | Avg ms | Min ms | Max ms |
| -------------------------- | ---------: | -----: | -----: | -----: |
| deep-tree-invalidation-11k |        240 | 0.2238 | 0.0539 | 11.762 |
| bounds-cache-1k-nodes      |        240 | 0.0591 | 0.0179 | 1.5878 |
| addchild-removechild-churn |        240 | 0.0449 | 0.0127 | 0.6044 |
| sort-by-zindex-1k          |        240 | 0.1577 | 0.1425 | 0.8744 |

---

## Interaction

Hit-test and drag-move pointer overhead.

| Scenario              | Iterations | Avg ms | Min ms | Max ms |
| --------------------- | ---------: | -----: | -----: | -----: |
| hit-test-recursive-1k |        240 | 2.3999 | 2.1195 | 14.161 |
| hit-test-quadtree-1k  |        240 | 0.4826 | 0.3903 | 6.8237 |
| drag-move-50-events   |        240 | 0.0123 | 0.0073 | 0.2632 |
