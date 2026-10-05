/**
 * Basic data format descriptors for the containers the KTX2 specs synthesize.
 *
 * Written from the Khronos Data Format registry and the KTX 2.0 descriptor layout, not from the
 * engine's tables: the colour model of a block-compressed family, its texel block, and its
 * samples are what a real writer emits, so a parser that expects an RGBSDA layout for every
 * format fails against these instead of agreeing with a builder that shares its assumption.
 */

const DFD_FIXED_BYTES = 28;
const DFD_SAMPLE_BYTES = 16;

const MODEL_RGBSDA = 1;
const MODEL_BC1A = 128;
const MODEL_BC2 = 129;
const MODEL_BC3 = 130;
const MODEL_BC4 = 131;
const MODEL_BC5 = 132;
const MODEL_BC6H = 133;
const MODEL_BC7 = 134;
const MODEL_ETC2 = 161;
const MODEL_ASTC = 162;

const CHANNEL_ALPHA = 15;
const SAMPLE_LINEAR = 0x10;
const SAMPLE_SIGNED = 0x40;
const SAMPLE_FLOAT = 0x80;

interface Sample {
  readonly offset: number;
  readonly length: number;
  readonly channel: number;
  readonly qualifiers?: number;
  readonly upper?: number;
}

interface Profile {
  readonly model: number;
  readonly blockWidth: number;
  readonly blockHeight: number;
  readonly blockBytes: number;
  readonly samples: readonly Sample[];
}

const astcBlocks: ReadonlyArray<readonly [number, number]> = [
  [4, 4],
  [5, 4],
  [5, 5],
  [6, 5],
  [6, 6],
  [8, 5],
  [8, 6],
  [8, 8],
  [10, 5],
  [10, 6],
  [10, 8],
  [10, 10],
  [12, 10],
  [12, 12],
];

const one = (length: number, channel: number, qualifiers = 0): readonly Sample[] => [{ offset: 0, length, channel, qualifiers }];
const two = (first: number, second: number, qualifiers = 0): readonly Sample[] => [
  { offset: 0, length: 64, channel: first, qualifiers },
  { offset: 64, length: 64, channel: second, qualifiers },
];

const profileFor = (vkFormat: number, srgb: boolean): Profile => {
  if (vkFormat === 37 || vkFormat === 43) {
    const alpha = srgb ? SAMPLE_LINEAR : 0;

    return {
      model: MODEL_RGBSDA,
      blockWidth: 1,
      blockHeight: 1,
      blockBytes: 4,
      samples: [
        { offset: 0, length: 8, channel: 0, upper: 255 },
        { offset: 8, length: 8, channel: 1, upper: 255 },
        { offset: 16, length: 8, channel: 2, upper: 255 },
        { offset: 24, length: 8, channel: CHANNEL_ALPHA, qualifiers: alpha, upper: 255 },
      ],
    };
  }

  if (vkFormat >= 131 && vkFormat <= 134) {
    return { model: MODEL_BC1A, blockWidth: 4, blockHeight: 4, blockBytes: 8, samples: one(64, vkFormat >= 133 ? 1 : 0) };
  }

  if (vkFormat === 135 || vkFormat === 136) {
    return { model: MODEL_BC2, blockWidth: 4, blockHeight: 4, blockBytes: 16, samples: two(CHANNEL_ALPHA, 0) };
  }

  if (vkFormat === 137 || vkFormat === 138) {
    return { model: MODEL_BC3, blockWidth: 4, blockHeight: 4, blockBytes: 16, samples: two(CHANNEL_ALPHA, 0) };
  }

  if (vkFormat === 139 || vkFormat === 140) {
    return { model: MODEL_BC4, blockWidth: 4, blockHeight: 4, blockBytes: 8, samples: one(64, 0, vkFormat === 140 ? SAMPLE_SIGNED : 0) };
  }

  if (vkFormat === 141 || vkFormat === 142) {
    return { model: MODEL_BC5, blockWidth: 4, blockHeight: 4, blockBytes: 16, samples: two(0, 1, vkFormat === 142 ? SAMPLE_SIGNED : 0) };
  }

  if (vkFormat === 143 || vkFormat === 144) {
    const qualifiers = vkFormat === 144 ? SAMPLE_FLOAT | SAMPLE_SIGNED : SAMPLE_FLOAT;

    return { model: MODEL_BC6H, blockWidth: 4, blockHeight: 4, blockBytes: 16, samples: one(128, 0, qualifiers) };
  }

  if (vkFormat === 145 || vkFormat === 146) {
    return { model: MODEL_BC7, blockWidth: 4, blockHeight: 4, blockBytes: 16, samples: one(128, 0) };
  }

  if (vkFormat >= 147 && vkFormat <= 150) {
    return { model: MODEL_ETC2, blockWidth: 4, blockHeight: 4, blockBytes: 8, samples: one(64, 2) };
  }

  if (vkFormat === 151 || vkFormat === 152) {
    return { model: MODEL_ETC2, blockWidth: 4, blockHeight: 4, blockBytes: 16, samples: two(CHANNEL_ALPHA, 2) };
  }

  if (vkFormat === 153) {
    return { model: MODEL_ETC2, blockWidth: 4, blockHeight: 4, blockBytes: 8, samples: one(64, 0) };
  }

  if (vkFormat === 155) {
    return { model: MODEL_ETC2, blockWidth: 4, blockHeight: 4, blockBytes: 16, samples: two(0, 1) };
  }

  if (vkFormat >= 157 && vkFormat <= 184) {
    const [blockWidth, blockHeight] = astcBlocks[Math.floor((vkFormat - 157) / 2)]!;

    return { model: MODEL_ASTC, blockWidth, blockHeight, blockBytes: 16, samples: one(128, 0) };
  }

  throw new Error(`ktx2-dfd: no descriptor profile for vkFormat ${vkFormat}`);
};

/** Block bytes of `vkFormat`, for the tests that lay out level data. */
export const ktx2BlockBytes = (vkFormat: number): number => profileFor(vkFormat, false).blockBytes;

/** Byte length of the descriptor {@link ktx2Dfd} writes for `vkFormat`. */
export const ktx2DfdLength = (vkFormat: number): number => DFD_FIXED_BYTES + profileFor(vkFormat, false).samples.length * DFD_SAMPLE_BYTES;

export interface Ktx2DfdOptions {
  /** `KHR_DF_TRANSFER_*`; 1 linear, 2 sRGB. */
  readonly transfer?: number;
  /** DFD flags byte; 1 is premultiplied alpha. */
  readonly alpha?: number;
  /** Overrides the colour model, for the specs that corrupt one field. */
  readonly model?: number;
}

/** The complete basic descriptor of `vkFormat`, `totalSize` word included. */
export const ktx2Dfd = (vkFormat: number, { transfer = 1, alpha = 0, model }: Ktx2DfdOptions = {}): Uint8Array => {
  const profile = profileFor(vkFormat, transfer === 2);
  const total = DFD_FIXED_BYTES + profile.samples.length * DFD_SAMPLE_BYTES;
  const dfd = new Uint8Array(total);
  const view = new DataView(dfd.buffer);

  view.setUint32(0, total, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, total - 4, true);
  dfd[12] = model ?? profile.model;
  dfd[13] = 1;
  dfd[14] = transfer;
  dfd[15] = alpha;
  dfd[16] = profile.blockWidth - 1;
  dfd[17] = profile.blockHeight - 1;
  dfd[20] = profile.blockBytes;

  for (const [index, sample] of profile.samples.entries()) {
    const base = DFD_FIXED_BYTES + index * DFD_SAMPLE_BYTES;
    const channelType = sample.channel | (sample.qualifiers ?? 0);

    view.setUint32(base, (sample.offset | ((sample.length - 1) << 16) | (channelType << 24)) >>> 0, true);
    view.setUint32(base + 12, sample.upper ?? 0xffffffff, true);
  }

  return dfd;
};
