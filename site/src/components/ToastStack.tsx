import { useSyncExternalStore } from 'react';

import { dismissToast, getToasts, subscribeToasts, type ToastMessage } from '../lib/toast-store';
import { css } from './react-utils';
import styles from './ToastStack.module.scss';

const EMPTY_TOASTS: ReadonlyArray<ToastMessage> = [];

export function ToastStack(): JSX.Element {
    // `getToasts` returns a stable module-level array ref (mutated only on change),
    // so it is a valid useSyncExternalStore snapshot. getServerSnapshot = empty.
    const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => EMPTY_TOASTS);

    return (
        <div className={css(styles, 'root')}>
            <div className={css(styles, 'stack')} aria-label="Notifications">
                {toasts.map(toast => (
                    <div key={toast.id} className={css(styles, 'toast')} data-toast-id={toast.id} role="status" aria-live="polite" aria-atomic="true">
                        <span className={css(styles, 'message')}>{toast.message}</span>
                        {toast.action && (
                            <button className={css(styles, 'action')} onClick={() => runAction(toast)}>
                                {toast.action.label}
                            </button>
                        )}
                        <button className={css(styles, 'close')} aria-label="Dismiss" title="Dismiss" onClick={() => dismissToast(toast.id)}>
                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
                                <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function runAction(toast: ToastMessage): void {
    try {
        toast.action?.onClick();
    } finally {
        dismissToast(toast.id);
    }
}
