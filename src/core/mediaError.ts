/**
 * Describes the failure a media element is currently reporting, falling back to
 * `fallback` when the element exposes no error detail.
 * @internal
 */
export const mediaErrorMessage = (element: HTMLMediaElement, fallback: string): string => {
  const error = element.error;

  if (!error) {
    return fallback;
  }

  return error.message.length > 0 ? `${fallback} ${error.message}` : `${fallback} (media error code ${error.code})`;
};
