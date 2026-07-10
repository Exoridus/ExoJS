import { createCpuTimer, median, percentile } from './timing';

describe('median', () => {
  test('odd length returns the middle value', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  test('even length averages the two middle values', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test('does not mutate the input array', () => {
    const input = [3, 1, 2];

    median(input);

    expect(input).toEqual([3, 1, 2]);
  });

  test('throws on an empty sample set rather than returning NaN', () => {
    expect(() => median([])).toThrow();
  });
});

describe('percentile', () => {
  test('p95 of 1..100 is 95', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);

    expect(percentile(samples, 95)).toBe(95);
  });

  test('p100 returns the maximum', () => {
    expect(percentile([1, 5, 3], 100)).toBe(5);
  });
});

describe('createCpuTimer', () => {
  test('records one sample per begin/end pair using the injected clock', () => {
    let clock = 0;
    const timer = createCpuTimer(() => clock);

    timer.begin();
    clock = 5;
    timer.end();

    timer.begin();
    clock = 12;
    timer.end();

    expect(timer.samples).toEqual([5, 7]);
  });

  test('end() without begin() throws rather than recording a bogus sample', () => {
    const timer = createCpuTimer(() => 0);

    expect(() => timer.end()).toThrow();
  });
});
