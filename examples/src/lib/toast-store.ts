// Tiny module-level toast store. Components call `showToast` imperatively
// and the root `<exo-toast-stack>` subscribes to render them. No portal
// or global-window hook is needed — the stack sits inside the shell's
// shadow root, which is always mounted.

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  action?: ToastAction;
}

export interface ShowToastOptions {
  action?: ToastAction;
  /**
   * Auto-dismiss delay in milliseconds. Pass 0 to keep the toast open until
   * the user dismisses it. Defaults to 3500 ms.
   */
  durationMs?: number;
}

type ToastListener = (toasts: ReadonlyArray<ToastMessage>) => void;

let _idCounter = 0;
let _toasts: ReadonlyArray<ToastMessage> = [];
const _listeners = new Set<ToastListener>();

const DEFAULT_DURATION_MS = 3500;

export function showToast(message: string, options: ShowToastOptions = {}): string {
  const id = `toast-${++_idCounter}`;
  const toast: ToastMessage = { id, message, action: options.action };

  _toasts = [..._toasts, toast];
  _notify();

  const duration = options.durationMs ?? DEFAULT_DURATION_MS;
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

export function dismissToast(id: string): void {
  const next = _toasts.filter(toast => toast.id !== id);
  if (next.length === _toasts.length) return;
  _toasts = next;
  _notify();
}

export function getToasts(): ReadonlyArray<ToastMessage> {
  return _toasts;
}

export function subscribeToasts(listener: ToastListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _notify(): void {
  for (const listener of _listeners) {
    listener(_toasts);
  }
}
