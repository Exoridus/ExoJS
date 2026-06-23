interface FileType {
  mimeType: string;
  pattern: number[];
  mask: number[];
}

const fileTypes: FileType[] = [
  {
    mimeType: 'image/x-icon',
    pattern: [0x00, 0x00, 0x01, 0x00],
    mask: [0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'image/x-icon',
    pattern: [0x00, 0x00, 0x02, 0x00],
    mask: [0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'image/bmp',
    pattern: [0x42, 0x4d],
    mask: [0xff, 0xff],
  },
  {
    mimeType: 'image/gif',
    pattern: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    mask: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'image/gif',
    pattern: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    mask: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'image/webp',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
    mask: [0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'image/png',
    pattern: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    mask: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'image/jpeg',
    pattern: [0xff, 0xd8, 0xff],
    mask: [0xff, 0xff, 0xff],
  },
  {
    mimeType: '@/audio/basic',
    pattern: [0x2e, 0x73, 0x6e, 0x64],
    mask: [0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: '@/audio/mpeg',
    pattern: [0x49, 0x44, 0x33],
    mask: [0xff, 0xff, 0xff],
  },
  {
    mimeType: '@/audio/wave',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45],
    mask: [0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: '@/audio/midi',
    pattern: [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06],
    mask: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: '@/audio/aiff',
    pattern: [0x46, 0x4f, 0x52, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x41, 0x49, 0x46, 0x46],
    mask: [0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'video/avi',
    pattern: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20],
    mask: [0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff],
  },
  {
    mimeType: 'application/ogg',
    pattern: [0x4f, 0x67, 0x67, 0x53, 0x00],
    mask: [0xff, 0xff, 0xff, 0xff, 0xff],
  },
];

const matchesMp4Video = (arrayBuffer: ArrayBuffer): boolean => {
  const header = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const boxSize = view.getUint32(0, false);

  if (header.length < Math.max(12, boxSize) || boxSize % 4 !== 0) {
    return false;
  }

  return String.fromCharCode(...header.subarray(4, 11)) === 'ftypmp4';
};

const matchesAvifImage = (arrayBuffer: ArrayBuffer): boolean => {
  if (arrayBuffer.byteLength < 12) {
    return false;
  }

  const header = new Uint8Array(arrayBuffer);

  if (String.fromCharCode(header[4], header[5], header[6], header[7]) !== 'ftyp') {
    return false;
  }

  const brand = String.fromCharCode(header[8], header[9], header[10], header[11]);

  return brand === 'avif' || brand === 'avis';
};

const matchesWebmVideo = (arrayBuffer: ArrayBuffer): boolean => {
  const header = new Uint8Array(arrayBuffer);
  const matching = [0x1a, 0x45, 0xdf, 0xa3].every((byte, i) => byte === header[i]);
  const sliced = header.subarray(4, 4 + 4096);
  const index = sliced.findIndex((_el, i, arr) => arr[i] === 0x42 && arr[i + 1] === 0x82);

  if (!matching || index === -1) {
    return false;
  }

  return String.fromCharCode(...sliced.subarray(index + 3, index + 7)) === 'webm';
};

/**
 * Sniffs the MIME type of binary data by inspecting its magic bytes.
 *
 * Checks a built-in table of byte patterns covering common image, audio, and
 * video formats (PNG, JPEG, GIF, BMP, WebP, AVIF, MP4, WebM, WAV, MP3, OGG,
 * MIDI, AIFF, AVI, and AU). Falls back to `"text/plain"` when no pattern
 * matches.
 *
 * Throws if `arrayBuffer` contains no data.
 */
export const determineMimeType = (arrayBuffer: ArrayBuffer): string => {
  const header = new Uint8Array(arrayBuffer);

  if (!header.length) {
    throw new Error('Cannot determine mime type: No data.');
  }

  for (const type of fileTypes) {
    if (header.length < type.pattern.length) {
      continue;
    }

    if (type.pattern.every((p, i) => (header[i] & type.mask[i]) === p)) {
      return type.mimeType;
    }
  }

  if (matchesMp4Video(arrayBuffer)) {
    return 'video/mp4';
  }

  if (matchesWebmVideo(arrayBuffer)) {
    return 'video/webm';
  }

  if (matchesAvifImage(arrayBuffer)) {
    return 'image/avif';
  }

  return 'text/plain';
};
