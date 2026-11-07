// The intrinsic getter recognizes foreign-realm views without trusting a caller's Symbol.toStringTag.
const typedArrayNameDescriptor = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Float32Array.prototype) as object,
  Symbol.toStringTag,
)!;

const arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!;

/** Name of the typed-array kind, or `undefined` for non-typed-array values. Realm-independent. @internal */
export const typedArrayName = (value: unknown): string | undefined => typedArrayNameDescriptor.get!.call(value) as string | undefined;

/** Realm-independent `ArrayBuffer` check; rejects `SharedArrayBuffer`. @internal */
export const isArrayBuffer = (value: unknown): value is ArrayBuffer => {
  try {
    arrayBufferByteLength.get!.call(value);

    return true;
  } catch {
    return false;
  }
};

/** Realm-independent `Uint8Array` check. @internal */
export const isUint8Array = (value: unknown): value is Uint8Array => typedArrayName(value) === 'Uint8Array';
