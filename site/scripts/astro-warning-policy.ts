import { isAbsolute, relative, resolve } from 'node:path';

interface BuildWarning {
  code?: string | undefined;
  id?: string | undefined;
  message: string;
}

export const isGeneratedAstroDirective = (warning: BuildWarning, contentDirectory: string): boolean => {
  const suffix = '.mdx?astroPropagatedAssets';
  if (
    warning.code !== 'MODULE_LEVEL_DIRECTIVE' ||
    !warning.id?.endsWith(suffix) ||
    !warning.message.includes('module level directive "use astro:head-inject"')
  ) {
    return false;
  }
  const source = warning.id.slice(0, -'?astroPropagatedAssets'.length).replaceAll('\\', '/');
  const content = contentDirectory.replaceAll('\\', '/');
  const fromContent = relative(resolve(content), resolve(source));
  return fromContent !== '..' && !fromContent.startsWith('../') && !fromContent.startsWith('..\\') && !isAbsolute(fromContent);
};
