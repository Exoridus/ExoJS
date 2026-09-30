# Externally encoded KTX2 corpus

Native block-compressed KTX2 containers whose payloads were produced by tools outside this repository. They complement `test/fixtures/color/`, and the two serve different purposes:

|                 | `color/`                                                                     | `color-external/`                                          |
| --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Payload         | constant-colour blocks written by a script from the format specifications    | blocks emitted by the Khronos `ktx` tool                   |
| Container / DFD | written by `generate-color-fixtures.ts`                                      | written by `ktx`                                           |
| Answers         | does the parser read every advertised format, mutation and block size right? | does a real GPU decode what a conforming encoder produced? |
| Formats         | every advertised BC, EAC and ASTC block size, both transfers                 | BC7, ETC2 RGB, ETC2 RGBA8, ASTC 4x4, both transfers        |

The hand-built fixtures stay for parser structure, exact descriptor mutations, signed/unsigned identity, block-dimension coverage and rejection cases. This corpus is deliberately small: it exists to put encoder-made bytes through the upload and sampling paths, not to repeat the structural matrix.

## Provenance

`manifest.json` records everything needed to reproduce a file: the tool and its version, the source image and its SHA-256, the exact `ktx` commands of each fixture, and every output's SHA-256, `vkFormat`, transfer and expected samples.

- **Tool:** KTX-Software `ktx` 4.4.2 (Apache-2.0, <https://github.com/KhronosGroup/KTX-Software>), the release asset `KTX-Software-4.4.2-Windows-x64.exe` unpacked without installing.
- **Source:** `source.png`, a 16x16 RGBA image of four 8x8 quadrants (red, green, blue, half-transparent yellow), authored for this repository.
- **BC7, ETC2 RGB, ETC2 RGBA8:** `ktx create --encode uastc --uastc-quality 4` produces a UASTC LDR 4x4 intermediate, and `ktx transcode --target bc7|etc-rgb|etc-rgba` turns it into native blocks with the Basis Universal transcoder shipped in the tool.
- **ASTC 4x4:** `ktx create --format ASTC_4x4_*_BLOCK --astc-quality thorough` encodes with astcenc.
- Every container passes `ktx validate --warnings-as-errors`, and the encoder runs with `--testrun`, so regenerating yields identical bytes.

## Regenerating and validating

```sh
pnpm fixtures:color:external --ktx path/to/ktx.exe
pnpm fixtures:color:validate --ktx path/to/ktx.exe
```

The tool is not a repository dependency, so CI does not run either command; `test/assets/ktx2-external-fixtures.test.ts` pins every file to its recorded SHA-256.

## What the browser suites assert

Each backend uploads a fixture through `TextureFactory`, draws it 1:1 into a 16x16 target and reads one texel inside every quadrant. sRGB fixtures are decoded on sample and encoded on write, so the bytes must match the source colours; linear fixtures stay numeric. The tolerance is `manifest.json#tolerance` code values: lossy encoders move a solid quadrant by a few codes, while a wrong transfer, channel order or block mode moves it by tens.

A device that cannot sample a format skips that fixture by name. That cell is unqualified on the host, not passed, and each skip is a reviewed entry in `scripts/skipped-tests-baseline.json`.

## Not covered

BC6H: `ktx` neither encodes nor transcodes to it from LDR sources. ASTC block sizes other than 4x4 and ETC2 RGB+A1 are covered structurally by `color/` only.
