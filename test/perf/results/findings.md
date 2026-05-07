# Performance Findings — Phase 2 Auto-Profile

Captured on 2026-05-06. GC available: true.

## Summary

Top-3 wins (auto-derived from highest cost-per-iteration + allocation scenarios):

1. **quadtree-query-10k** — All 1000000 leaf-tests run in 1321.8 ms total (13.218 ms/iter). Memory delta 0.00 MB — result arrays reallocated each query.
   - Recommendation: Pass a pre-allocated result buffer into queryPoint() on hot paths to eliminate per-query array allocation. The interaction-benchmark already does this with a shared `buf` array — pattern is proven. Estimated win: reduce GC pressure, lower tail latency.
2. **sat-polygon-pairs-1k** — getNormals() (both shapes) consumes ~2% of total SAT time. Memory delta 0.08 MB over 1000 iters (0.1 KB/iter) suggests per-call Vector array allocations.
   - Recommendation: Cache getNormals() result on Polygon (invalidate on point mutation). The 0.6.19 dirty-flag pattern used for Sprite normals is the reference implementation (commit 76d7d4a). Estimated win: 2% of 6.097 ms/iter.
3. **hit-test-recursive-1k** — Linear tree-walk averages 0.0241 ms/query over 100 queries/frame. No spatial pruning — all 1000 nodes visited regardless of pointer position. Memory delta 0.26 MB.
   - Recommendation: Use the quadtree-accelerated path (hit-test-quadtree-1k is 5× faster per the baseline). InteractionManager should maintain a persistent spatial index rebuilt only on scene-graph changes, not every frame. Amortizes the build cost across all queries in the frame.

---

## Detailed Profile Per Scenario

### Scenario: sat-polygon-pairs-1k
- Total: 6096.57 ms (1000 iterations, 6.0966 ms/iter)
- Memory delta: 0.076 MB (gc=true)
- Sub-timings:
  | Phase             | Avg ms  | Samples |
  | ----------------- | ------: | ------: |
  | getNormals.A      | 0.00005 | 1000000 |
  | getNormals.B      | 0.00006 | 1000000 |
  | intersection-test | 0.00575 | 1000000 |
- Call counts:
  | Operation               | Count |
  | ----------------------- | ----: |
  | polygon-pair-iterations |  1000 |

### Scenario: quadtree-query-10k
- Total: 1321.80 ms (100 iterations, 13.2180 ms/iter)
- Memory delta: -0.004 MB (gc=true)
- Sub-timings:
  | Phase                 | Avg ms   | Samples |
  | --------------------- | -------: | ------: |
  | tree-walk-all-queries | 13.21569 |     100 |
- Call counts:
  | Operation              | Count   |
  | ---------------------- | ------: |
  | query-batch-iterations |     100 |
  | leaf-tests             | 1000000 |

### Scenario: hit-test-recursive-1k
- Total: 582.71 ms (240 iterations, 2.4280 ms/iter)
- Memory delta: 0.265 MB (gc=true)
- Sub-timings:
  | Phase     | Avg ms  | Samples |
  | --------- | ------: | ------: |
  | tree-walk | 0.02413 |   24000 |
- Call counts:
  | Operation         | Count |
  | ----------------- | ----: |
  | frame-ticks       |   240 |
  | recursive-queries | 24000 |

### Scenario: deep-tree-invalidation-11k
- Total: 116.56 ms (1000 iterations, 0.1166 ms/iter)
- Memory delta: -0.034 MB (gc=true)
- Sub-timings:
  | Phase     | Avg ms  | Samples |
  | --------- | ------: | ------: |
  | flag-push | 0.11606 |    1000 |
- Call counts:
  | Operation             | Count |
  | --------------------- | ----: |
  | invalidation-triggers |  1000 |

### Scenario: many-sounds-play
- Total: 110.25 ms (1000 iterations, 0.1103 ms/iter)
- Memory delta: 0.234 MB (gc=true)
- Sub-timings:
  | Phase      | Avg ms  | Samples |
  | ---------- | ------: | ------: |
  | sound.play | 0.00209 |   50000 |
- Call counts:
  | Operation        | Count |
  | ---------------- | ----: |
  | play-batches     |  1000 |
  | sound-play-calls | 50000 |
