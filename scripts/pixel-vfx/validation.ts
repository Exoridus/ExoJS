import Ajv2020 from 'ajv/dist/2020.js';

export interface PixelVfxRecipe {
  version: number;
  name: string;
  width: number;
  height: number;
  palette: Record<string, string>;
  frames: Array<{ name: string; duration: number; ops?: Array<Record<string, unknown>>; [key: string]: unknown }>;
  animations: Record<string, { frames: string[]; loop: boolean; direction?: string }>;
  sheet: { columns: number; padding: number; scale: number; trim: boolean };
  [key: string]: unknown;
}

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

export interface PixelVfxAtlas {
  frames: Record<string, AtlasFrame>;
  animations: Record<string, { frames: string[]; loop: boolean; duration: number }>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
    frameTags: Array<{ name: string; from: number; to: number; direction: 'forward'; repeat?: string }>;
  };
}

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface PixelReport {
  opaquePixels: number;
  colors: string[];
  frameBounds: Array<{ name: string; x: number; y: number; w: number; h: number; pixels: number }>;
}

const requireValue = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const sameSequence = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const createRecipeValidator = (schema: object): ((source: unknown, effect: string) => PixelVfxRecipe) => {
  // The published schema's conditional branches inherit types and properties from their parents.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
  const validate = ajv.compile(schema);

  return (source, effect) => {
    if (!validate(source)) {
      throw new Error(`${effect}: Pixelbolt JSON Schema validation failed: ${ajv.errorsText(validate.errors)}`);
    }

    const recipe = source as PixelVfxRecipe;
    requireValue(recipe.name === `pixel-vfx-${effect}`, `${effect}: recipe name must match its output basename`);
    requireValue([32, 64].includes(recipe.width) && recipe.height === recipe.width, `${effect}: use native 32x32 or 64x64 frames`);
    requireValue(
      recipe.sheet?.columns === 4 && recipe.sheet.padding === 2 && recipe.sheet.scale === 1 && recipe.sheet.trim === false,
      `${effect}: sheet must use columns 4, padding 2, scale 1, and trim false`,
    );
    requireValue(
      recipe.palette?.$ref === '../palette.json' && Object.keys(recipe.palette).length === 1,
      `${effect}: use the shared palette without local overrides`,
    );
    requireValue(recipe.frames.length >= 2, `${effect}: an effect needs at least two frames`);

    for (const frame of recipe.frames) {
      requireValue(
        Number.isInteger(frame.duration) && frame.duration > 0,
        `${effect}/${frame.name}: duration must be explicit positive milliseconds`,
      );
    }

    const names = recipe.frames.map(frame => frame.name);
    requireValue(new Set(names.map(name => name.toLowerCase())).size === names.length, `${effect}: frame names must be unique`);
    requireValue(
      recipe.animations !== undefined && sameSequence(Object.keys(recipe.animations), ['play']),
      `${effect}: declare exactly one animation named play`,
    );
    const play = recipe.animations.play;
    requireValue(typeof play.loop === 'boolean', `${effect}: play.loop must be explicit`);
    requireValue(
      sameSequence(play.frames, names) && (play.direction === undefined || play.direction === 'forward'),
      `${effect}: play must use every frame once in source order`,
    );

    return recipe;
  };
};

export const adaptAtlas = (atlas: PixelVfxAtlas, recipe: PixelVfxRecipe): Omit<PixelVfxAtlas, 'animations'> => {
  const names = recipe.frames.map(frame => frame.name);
  const { columns, padding } = recipe.sheet;
  const cellWidth = recipe.width + 2 * padding;
  const cellHeight = recipe.height + 2 * padding;
  requireValue(sameSequence(Object.keys(atlas.frames), names), `${recipe.name}: atlas frame order differs from the recipe`);
  requireValue(
    atlas.meta.image === `${recipe.name}.png` && atlas.meta.scale === '1',
    `${recipe.name}: atlas image name or scale differs from the recipe`,
  );
  requireValue(
    atlas.meta.size.w === columns * cellWidth && atlas.meta.size.h === Math.ceil(names.length / columns) * cellHeight,
    `${recipe.name}: atlas dimensions do not match the native frame grid`,
  );

  for (const [index, name] of names.entries()) {
    const frame = atlas.frames[name];
    const expectedX = (index % columns) * cellWidth + padding;
    const expectedY = Math.floor(index / columns) * cellHeight + padding;
    requireValue(
      frame.frame.x === expectedX && frame.frame.y === expectedY && frame.frame.w === recipe.width && frame.frame.h === recipe.height,
      `${recipe.name}/${name}: atlas rectangle differs from its native grid cell`,
    );
    requireValue(
      frame.rotated === false &&
        frame.trimmed === false &&
        frame.spriteSourceSize.x === 0 &&
        frame.spriteSourceSize.y === 0 &&
        frame.spriteSourceSize.w === recipe.width &&
        frame.spriteSourceSize.h === recipe.height &&
        frame.sourceSize.w === recipe.width &&
        frame.sourceSize.h === recipe.height,
      `${recipe.name}/${name}: atlas must keep each full unrotated native frame`,
    );
    requireValue(frame.duration === recipe.frames[index].duration, `${recipe.name}/${name}: atlas duration differs from the recipe`);
  }

  const animation = atlas.animations.play;
  requireValue(
    animation !== undefined && sameSequence(Object.keys(atlas.animations), ['play']) && sameSequence(animation.frames, names),
    `${recipe.name}: exported animation order differs from the recipe`,
  );
  requireValue(animation.loop === recipe.animations.play.loop, `${recipe.name}: exported loop flag differs from the recipe`);
  requireValue(
    animation.duration === recipe.frames.reduce((total, frame) => total + frame.duration, 0),
    `${recipe.name}: exported animation duration differs from the recipe`,
  );
  const tag = atlas.meta.frameTags[0];
  requireValue(
    atlas.meta.frameTags.length === 1 &&
      tag.name === 'play' &&
      tag.from === 0 &&
      tag.to === names.length - 1 &&
      tag.direction === 'forward',
    `${recipe.name}: exported frame tag cannot represent the source animation`,
  );

  // Pixelbolt preserves loop in animations but omits Aseprite's equivalent repeat field.
  return {
    frames: atlas.frames,
    meta: { ...atlas.meta, frameTags: [{ ...tag, repeat: animation.loop ? '0' : '1' }] },
  };
};

const opaquePaletteColors = (palette: Record<string, string>): Set<string> => {
  const colors = new Set<string>();

  for (const value of Object.values(palette)) {
    if (value === 'transparent') {
      continue;
    }

    requireValue(/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value), `Invalid shared palette color ${value}`);
    const expanded = value.length <= 5 ? [...value.slice(1)].map(character => character + character).join('') : value.slice(1);
    const alpha = expanded.length === 8 ? expanded.slice(6).toLowerCase() : 'ff';
    requireValue(alpha === '00' || alpha === 'ff', `Shared palette must use binary alpha: ${value}`);

    if (alpha === 'ff') {
      colors.add(`#${expanded.slice(0, 6).toLowerCase()}`);
    }
  }

  requireValue(colors.size > 0, 'Shared palette needs at least one opaque color');

  return colors;
};

export const validatePixels = (
  image: PixelImage,
  atlas: Pick<PixelVfxAtlas, 'frames' | 'meta'>,
  recipe: PixelVfxRecipe,
  palette: Record<string, string>,
): PixelReport => {
  const { width, height, data } = image;
  requireValue(
    width === atlas.meta.size.w && height === atlas.meta.size.h && data.length === width * height * 4,
    `${recipe.name}: PNG dimensions differ from the atlas`,
  );
  const allowed = opaquePaletteColors(palette);
  const used = new Set<string>();
  const owners = new Int16Array(width * height).fill(-1);
  const entries = Object.entries(atlas.frames);
  const bounds = entries.map(([name]) => ({ name, x: recipe.width, y: recipe.height, right: -1, bottom: -1, pixels: 0 }));

  for (const [index, [, entry]] of entries.entries()) {
    const rect = entry.frame;

    for (let y = rect.y; y < rect.y + rect.h; y++) {
      owners.fill(index, y * width + rect.x, y * width + rect.x + rect.w);
    }
  }

  let opaquePixels = 0;

  for (let pixel = 0; pixel < owners.length; pixel++) {
    const at = pixel * 4;
    const alpha = data[at + 3];
    requireValue(alpha === 0 || alpha === 255, `${recipe.name}: partial alpha at atlas pixel ${pixel}`);

    if (alpha === 0) {
      continue;
    }

    const owner = owners[pixel];
    requireValue(owner >= 0, `${recipe.name}: nontransparent gutter at atlas pixel ${pixel}`);
    const rect = entries[owner][1].frame;
    const x = (pixel % width) - rect.x;
    const y = Math.floor(pixel / width) - rect.y;
    requireValue(
      x >= 2 && y >= 2 && x < recipe.width - 2 && y < recipe.height - 2,
      `${recipe.name}/${entries[owner][0]}: artwork enters the two-pixel native frame border at ${x},${y}`,
    );
    const color = `#${[data[at], data[at + 1], data[at + 2]].map(value => value.toString(16).padStart(2, '0')).join('')}`;
    requireValue(allowed.has(color), `${recipe.name}: color ${color} is outside the shared palette`);
    used.add(color);
    opaquePixels++;
    const box = bounds[owner];
    box.x = Math.min(box.x, x);
    box.y = Math.min(box.y, y);
    box.right = Math.max(box.right, x);
    box.bottom = Math.max(box.bottom, y);
    box.pixels++;
  }

  requireValue(opaquePixels > 0, `${recipe.name}: every frame is transparent`);

  return {
    opaquePixels,
    colors: [...used].sort(),
    frameBounds: bounds.map(({ name, x, y, right, bottom, pixels }) => ({
      name,
      x: pixels ? x : 0,
      y: pixels ? y : 0,
      w: pixels ? right - x + 1 : 0,
      h: pixels ? bottom - y + 1 : 0,
      pixels,
    })),
  };
};
