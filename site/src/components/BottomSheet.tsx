import { type ReactNode,useEffect, useId, useRef } from 'react';

import styles from './BottomSheet.module.scss';
import { css } from './react-utils';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

let scrollLockCount = 0;
let previousBodyOverflow = '';

export interface BottomSheetProps {
    children: ReactNode;
    open: boolean;
    title: string;
    opener?: HTMLElement | null;
    onOpenChange(open: boolean): void;
}

export function BottomSheet({ children, open, title, opener, onOpenChange }: BottomSheetProps): JSX.Element {
    const titleId = useId();
    const sheetRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;

        if (scrollLockCount === 0) {
            previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        scrollLockCount += 1;

        const inertTargets = Array.from(document.querySelectorAll('.app-shell__main')).filter(
            (element): element is HTMLElement => element instanceof HTMLElement,
        );
        const previousAriaHidden = inertTargets.map(element => element.getAttribute('aria-hidden'));
        for (const target of inertTargets) {
            target.setAttribute('aria-hidden', 'true');
            (target as HTMLElement & { inert?: boolean }).inert = true;
        }

        const focusFirst = window.setTimeout(() => {
            const focusables = getFocusable(sheetRef.current);
            (focusables[0] ?? sheetRef.current)?.focus();
        });

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onOpenChange(false);
                return;
            }

            if (event.key !== 'Tab') return;
            const focusables = getFocusable(sheetRef.current);
            if (focusables.length === 0) {
                event.preventDefault();
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
                return;
            }

            if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            window.clearTimeout(focusFirst);
            document.removeEventListener('keydown', onKeyDown);

            inertTargets.forEach((target, index) => {
                (target as HTMLElement & { inert?: boolean }).inert = false;
                const ariaHidden = previousAriaHidden[index];
                if (ariaHidden === null) target.removeAttribute('aria-hidden');
                else target.setAttribute('aria-hidden', ariaHidden);
            });

            scrollLockCount = Math.max(0, scrollLockCount - 1);
            if (scrollLockCount === 0) {
                document.body.style.overflow = previousBodyOverflow;
            }

            opener?.focus();
        };
    }, [onOpenChange, open, opener]);

    return (
        <div className={css(styles, 'host')} data-open={open ? 'true' : undefined}>
            <div className={css(styles, 'root')} aria-hidden={open ? 'false' : 'true'}>
                <button className={css(styles, 'backdrop')} type="button" aria-label="Close" onClick={() => onOpenChange(false)} />
                <section ref={sheetRef} className={css(styles, 'sheet')} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
                    <div className={css(styles, 'handle')} aria-hidden="true" />
                    <header className={css(styles, 'head')}>
                        <h2 id={titleId} className={css(styles, 'title')}>
                            {title}
                        </h2>
                        <button className={css(styles, 'close')} type="button" onClick={() => onOpenChange(false)} aria-label="Close dialog">
                            Close
                        </button>
                    </header>
                    <div className={css(styles, 'body')}>{children}</div>
                </section>
            </div>
        </div>
    );
}

function getFocusable(root: HTMLElement | null): HTMLElement[] {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (node): node is HTMLElement => node instanceof HTMLElement && !node.hasAttribute('hidden') && !node.hasAttribute('inert'),
    );
}
