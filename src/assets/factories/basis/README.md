# Basis Universal runtime

Built from official Basis Universal source at https://github.com/BinomialLLC/basis_universal/tree/99f52d63aa6799cbdaecfe977111dc5ec3b31d47/webgl/transcoder (Basis Universal 2.50 development), using Emscripten 4.0.11 (compiler commit `d3432e7a2a6585331c94b041973fb16c9f332ce4`). The upstream CMake build flags are unchanged except for adding `-sDYNAMIC_EXECUTION=0` at link time. `basis_transcoder.wasm` is the compiler output; `basis_transcoder.mjs` is the generated JS plus `export default BASIS;` for module-worker loading. The encoder is not shipped. Apache-2.0, the bundled Zstd BSD-3-Clause license, and Emscripten MIT/NCSA notices are in `LICENSE`.

The runtime is fetched only inside the first universal-texture worker, then reused until the loader is destroyed. ExoJS validates KTX2 structure, dimensions, ranges, DFD, KVD, color, alpha, and the supported RGB/RGBA profile before the worker receives bytes. `KTX2File` performs the codec-specific decoding, including UASTC Zstd; its metadata must agree with the validated descriptor. Native and ZLIB textures never initialize this runtime. The source cache retains its buffer; one copy is transferred into the worker, and final mip buffers are transferred back.

The production worker bundles the JS glue separately from Core. The WASM stays external and package-relative. Build output includes both `dist/basis` for bundles and `dist/esm/assets/factories/basis` for npm ESM; Full ZIP carries both. Vite resolves the module worker and its WASM URL. Serve `.wasm` as `application/wasm`; the Full ZIP server already does. The worker fetches binary bytes and uses `WebAssembly.instantiate`, so streaming MIME support is not required.

CSP: the generated glue contains no `eval` or `new Function` calls. JavaScript `unsafe-eval` is not required. Allow `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, and `connect-src 'self'` for same-origin worker/WASM loading. Apply the policy to the worker response too: an external module worker has its own CSP. No `importScripts`, dynamic script element, CDN, or blob worker is used by the shipped runtime.

Supported: non-array 2D ETC1S RGB/RGBA with BasisLZ, UASTC LDR 4x4 RGB/RGBA with scheme 0 or Zstd, all authored mips, linear/sRGB transfer and straight/premultiplied alpha. Target selection follows backend capability order and filters channel/alpha/transfer compatibility. BC7, ASTC 4x4, ETC2 RGB/RGBA, BC3 and opaque BC1 are eligible; RGBA8 is the fallback. Base dimensions not aligned to 4x4 blocks use RGBA8 to preserve the existing cross-backend compressed payload contract. Opaque texels retain alpha 255; ExoJS's alpha-association API represents them as straight.

Unsupported: arbitrary native `vkFormat` plus Zstd, universal ZLIB, standalone `.basis`, universal R/RG channel models, HDR/XUASTC/video, arrays, cubemaps and 3D. The existing native KTX2 formats and validation remain authoritative.

## Rebuilding the runtime

Install CMake and Ninja, then run the following with the pinned SDK. On Windows, use `emsdk\emsdk.bat` for SDK commands and dot-source `emsdk\emsdk_env.ps1` instead of the shell environment script. `CMAKE_POLICY_VERSION_MINIMUM` permits the unchanged upstream CMake 3.5 project to configure with CMake 4; it does not change compiler or linker flags.

```bash
git clone --depth 1 --branch 4.0.11 https://github.com/emscripten-core/emsdk.git emsdk
./emsdk/emsdk install 4.0.11
./emsdk/emsdk activate 4.0.11
source ./emsdk/emsdk_env.sh
git init basis-source
git -C basis-source remote add origin https://github.com/BinomialLLC/basis_universal.git
git -C basis-source fetch --depth 1 origin 99f52d63aa6799cbdaecfe977111dc5ec3b31d47
git -C basis-source checkout --detach FETCH_HEAD
emcmake cmake -S basis-source/webgl/transcoder -B basis-build -G Ninja "-DCMAKE_POLICY_VERSION_MINIMUM=3.5" "-DCMAKE_EXE_LINKER_FLAGS=-sDYNAMIC_EXECUTION=0"
cmake --build basis-build --parallel
```

Copy `basis-build/basis_transcoder.wasm` unchanged, and append `\nexport default BASIS;\n` to `basis-build/basis_transcoder.js` when saving it as `basis_transcoder.mjs`. KTX2 and KTX2_ZSTANDARD stay enabled, as do the upstream transcoder feature definitions. Rebuilding the runtime is a maintainer operation; package consumers receive the ready-to-use worker and WASM.

The shipped SHA-256 values are `82714141df3dca7f77f45027f8dfba9217140f4594a871e25ad0094aae543434` for `basis_transcoder.mjs` and `8ea3599c891965c651eae9495bf90a19be797db908ad739ea7db044f5ce8eb89` for `basis_transcoder.wasm`.
