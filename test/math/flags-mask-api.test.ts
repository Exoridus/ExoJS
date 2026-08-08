import { Flags } from '#math/Flags';

const enum TestFlags {
  None = 0x00,
  A = 0x01,
  B = 0x02,
  C = 0x04,
  D = 0x08,
}

describe('Flags mask API', () => {
  test('hasMask answers "any bit of the mask is set"', () => {
    const flags = new Flags<typeof TestFlags>(TestFlags.A, TestFlags.C);

    expect(flags.hasMask(TestFlags.A)).toBe(true);
    expect(flags.hasMask(TestFlags.B)).toBe(false);
    expect(flags.hasMask(TestFlags.B | TestFlags.C)).toBe(true);
    expect(flags.hasMask(TestFlags.B | TestFlags.D)).toBe(false);
    expect(flags.hasMask(TestFlags.None)).toBe(false);
  });

  test('addMask sets every bit of the mask and returns this', () => {
    const flags = new Flags<typeof TestFlags>();

    expect(flags.addMask(TestFlags.A | TestFlags.B)).toBe(flags);
    expect(flags.value).toBe(TestFlags.A | TestFlags.B);

    flags.addMask(TestFlags.B | TestFlags.C);

    expect(flags.value).toBe(TestFlags.A | TestFlags.B | TestFlags.C);
  });

  test('removeMask clears every bit of the mask and returns this', () => {
    const flags = new Flags<typeof TestFlags>(TestFlags.A, TestFlags.B, TestFlags.C);

    expect(flags.removeMask(TestFlags.A | TestFlags.C)).toBe(flags);
    expect(flags.value).toBe(TestFlags.B);

    flags.removeMask(TestFlags.D);

    expect(flags.value).toBe(TestFlags.B);
  });

  test('the mask forms agree with the rest-argument forms', () => {
    const viaRest = new Flags<typeof TestFlags>().push(TestFlags.A, TestFlags.C);
    const viaMask = new Flags<typeof TestFlags>().addMask(TestFlags.A | TestFlags.C);

    expect(viaMask.value).toBe(viaRest.value);
    expect(viaMask.hasMask(TestFlags.A | TestFlags.B)).toBe(viaRest.has(TestFlags.A, TestFlags.B));
    expect(viaMask.removeMask(TestFlags.A).value).toBe(viaRest.remove(TestFlags.A).value);
  });

  test('popMask reports and clears in one step', () => {
    const flags = new Flags<typeof TestFlags>(TestFlags.A);

    expect(flags.popMask(TestFlags.A)).toBe(true);
    expect(flags.hasMask(TestFlags.A)).toBe(false);
    expect(flags.popMask(TestFlags.A)).toBe(false);
  });
});
