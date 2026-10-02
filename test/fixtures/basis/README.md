# Basis Universal KTX2 fixtures

The images are original synthetic constant RGBA [128, 64, 32, 255] or [128, 64, 32, 128] data, dedicated to the public domain under CC0-1.0. No external image content is used. Each regular image is 28x12 (NPOT) with five authored mips: 28x12, 14x6, 7x3, 3x1, 1x1. The additional odd images are 17x9, 8x4, 4x2, 2x1, 1x1.

Reproduce with `pnpm exec tsx scripts/generate-basis-ktx2-fixtures.ts`. This downloads the official encoder at Basis Universal commit `99f52d63aa6799cbdaecfe977111dc5ec3b31d47`, supplies raw RGBA pixels, enables mip generation and quality 255, and writes ETC1S/BasisLZ or UASTC LDR 4x4 with optional Zstd, linear or sRGB transfer, and straight alpha. `manifest.json` records hashes and the independent source pixel oracle. The encoder and its downloads are disposable and are not runtime dependencies.
