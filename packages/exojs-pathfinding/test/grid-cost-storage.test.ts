import assert from 'node:assert/strict';

import { GridSpace } from '#spaces/GridSpace';

const assertUniform = (grid: GridSpace): void => {
  assert.equal(grid.uniformCost, true);
  assert.notEqual(grid.pruning(1), null);
};

describe('GridSpace Float32 cost storage', () => {
  test('treats writes rounded to the current cost as no-ops', () => {
    const grid = new GridSpace(4, 4);

    for (const cost of [1.00000001, 0.99999999, 1]) {
      grid.setCost(2, 2, cost);
      assert.equal(grid.costAt(2, 2), 1);
      assert.equal(grid.revision, 0);
      assertUniform(grid);
    }
  });

  test('restores pruning after repeated weighted and rounded-unit writes', () => {
    const grid = new GridSpace(4, 4);

    for (let cycle = 0; cycle < 10; cycle++) {
      grid.setCost(2, 2, 1.00000001);
      grid.setCost(2, 2, 2);
      assert.equal(grid.uniformCost, false);
      assert.equal(grid.pruning(1), null);
      grid.setCost(2, 2, 1);
      assertUniform(grid);
    }
  });

  test('classifies bulk-filled cells by the value that was stored', () => {
    const grid = GridSpace.from(4, 4, (x, y) => (x === y ? 0 : 1.00000001));

    assert.equal(grid.costAt(1, 0), 1);
    assert.equal(grid.costAt(0, 0), 0);
    assertUniform(grid);
  });

  test('does not let bulk rounding make the heuristic overestimate an edge', () => {
    const raw = 0.7;
    const grid = GridSpace.from(2, 1, () => raw, { diagonals: 'never' });

    assert.equal(grid.costAt(1, 0), Math.fround(raw));
    assert.equal(grid.heuristic(0, 1), grid.costAt(1, 0));
  });

  test('uses the same representable lower bound after an individual edit', () => {
    const grid = new GridSpace(2, 1, { diagonals: 'never' });

    grid.setCost(1, 0, 0.7);
    assert.equal(grid.heuristic(0, 1), grid.costAt(1, 0));
  });

  test('keeps blocked and weighted accounting consistent at storage limits', () => {
    for (const cost of [Number.MAX_VALUE, Number.MIN_VALUE, Infinity, NaN, -1, 0]) {
      const grid = new GridSpace(2, 1);

      grid.setCost(1, 0, cost);
      assert.equal(grid.costAt(1, 0), 0);
      assertUniform(grid);
      grid.setCost(1, 0, 2);
      assert.equal(grid.uniformCost, false);
      grid.setCost(1, 0, 1);
      assertUniform(grid);
      const bulk = GridSpace.from(2, 1, () => cost);

      assert.equal(bulk.costAt(0, 0), 0);
      assertUniform(bulk);
    }
  });

  test('retains positive representable subnormal and large costs', () => {
    for (const cost of [2 ** -149, 2 ** 100, 0.5, 2]) {
      const grid = GridSpace.from(2, 1, () => cost);

      assert.equal(grid.costAt(1, 0), Math.fround(cost));
      assert.equal(grid.uniformCost, false);
      assert.equal(grid.pruning(1), null);
      grid.setCost(0, 0, 1);
      grid.setCost(1, 0, 1);
      assertUniform(grid);
    }
  });
});
