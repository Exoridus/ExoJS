import { useSyncExternalStore } from 'react';

const NEVER_UNSUBSCRIBE = (): void => {
  // Nothing was subscribed to - see useClientValue.
};

const subscribeToFixedValue = (): (() => void) => NEVER_UNSUBSCRIBE;

/**
 * Reads a browser-only value that is fixed for the lifetime of the page -
 * platform detection, portal readiness, capability probes. The server render
 * and the hydration pass both see `serverValue`; React re-renders with the real
 * one immediately afterwards.
 *
 * This is deliberately not `useState` + a mount effect: writing a fixed fact
 * into component state makes it look mutable and costs a cascading render.
 *
 * @param read - Reads the real value; only ever called in the browser.
 * @param serverValue - Stand-in used during SSR and hydration.
 * @returns `serverValue` on the server, the value `read` returns on the client.
 */
export const useClientValue = <T>(read: () => T, serverValue: T): T => {
  return useSyncExternalStore(subscribeToFixedValue, read, () => serverValue);
};

export const cx = (...parts: Array<string | false | null | undefined>): string => {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
};

export const css = (styles: Record<string, string>, name: string): string => {
  return styles[name] ?? name;
};
