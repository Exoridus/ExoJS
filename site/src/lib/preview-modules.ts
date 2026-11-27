export const isEditableSharedFile = (path: string | null): boolean =>
  path === 'shared/runtime.ts' || path === 'shared/gallery-transitions.ts';

export const serializePreviewModules = (modules: Readonly<Record<string, string>> | undefined): string | null => {
  const edited = Object.fromEntries(Object.entries(modules ?? {}).filter(([path]) => isEditableSharedFile(path)));

  return Object.keys(edited).length > 0 ? JSON.stringify(edited) : null;
};
