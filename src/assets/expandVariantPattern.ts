import type { AssetVariant } from './AssetVariantSet';

const maxCandidates = 256;

const choices = (list: string): string[] => [...new Set(list.split(',').map(value => value.trim()))];

interface VariantGroups {
  readonly base: string;
  readonly suffix: string;
  readonly densities: string | undefined;
  readonly formats: string | undefined;
  readonly extension: string;
}

const readGroups = (source: string): VariantGroups | undefined => {
  if (!source.includes('{') || /^(?:blob|data):/i.test(source)) {
    return;
  }

  const suffixStart = source.search(/[?#]/);
  const path = suffixStart === -1 ? source : source.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : source.slice(suffixStart);
  const formatGroupStart = path.endsWith('}') ? path.lastIndexOf('.{') : -1;
  const extensionStart = formatGroupStart === -1 ? path.lastIndexOf('.') : formatGroupStart;

  if (extensionStart === -1) {
    return;
  }

  const stem = path.slice(0, extensionStart);
  const densityGroupStart = stem.endsWith('}x') ? stem.lastIndexOf('@{') : -1;
  const base = densityGroupStart === -1 ? stem : stem.slice(0, densityGroupStart);

  if ((densityGroupStart === -1 && formatGroupStart === -1) || base === '' || /[{}]/.test(base)) {
    return;
  }

  return {
    base,
    suffix,
    densities: densityGroupStart === -1 ? undefined : stem.slice(densityGroupStart + 2, -2),
    formats: formatGroupStart === -1 ? undefined : path.slice(formatGroupStart + 2, -1),
    extension: path.slice(extensionStart + 1),
  };
};

const readDensity = (source: string, token: string): number => {
  const density = Number(token);

  if (!/^[0-9.]+$/.test(token) || !Number.isFinite(density) || density <= 0) {
    throw new TypeError(`Asset variant pattern needs a positive density, got "${token}" in "${source}".`);
  }

  return density;
};

/** Expand the density and format groups of a logical texture source. @internal */
export const expandVariantPattern = (source: string): readonly AssetVariant[] | undefined => {
  const group = readGroups(source);

  if (group === undefined) {
    return undefined;
  }

  const { base, suffix, densities, formats, extension } = group;
  const densityChoices = densities === undefined ? [undefined] : choices(densities);
  const formatChoices = formats === undefined ? [extension] : choices(formats);

  if (densityChoices.length * formatChoices.length > maxCandidates) {
    throw new RangeError(`Asset variant pattern expands to more than ${maxCandidates} candidates: "${source}".`);
  }

  const invalidFormat = formatChoices.find(value => !/^[a-z0-9]+$/i.test(value));

  if (invalidFormat !== undefined) {
    throw new TypeError(`Asset variant pattern needs a format extension, got "${invalidFormat}" in "${source}".`);
  }

  const candidates: AssetVariant[] = [];

  for (const token of densityChoices) {
    const resolution = token === undefined ? undefined : readDensity(source, token);
    const scale = token === undefined ? '' : `@${token}x`;

    for (const format of formatChoices) {
      candidates.push({
        source: `${base}${scale}.${format}${suffix}`,
        ...(resolution === undefined ? {} : { resolution }),
        ...(formats === undefined ? {} : { imageFormat: format.toLowerCase() }),
      });
    }
  }

  return candidates;
};
