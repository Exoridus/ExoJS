import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { activateModalFocus } from '../lib/modal-focus';
import styles from './BottomSheet.module.scss';
import { css, useClientValue } from './react-utils';

const inBrowser = (): boolean => true;

export interface BottomSheetProps {
  children: ReactNode;
  open: boolean;
  title: string;
  opener?: HTMLElement | null;
  onOpenChange(open: boolean): void;
}

export const BottomSheet = ({ children, open, title, opener, onOpenChange }: BottomSheetProps): JSX.Element => {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  // Portal target only exists in the browser; render nothing during SSR.
  const mounted = useClientValue(inBrowser, false);

  useEffect(() => {
    if (!open || !mounted || !sheetRef.current) {
      return;
    }

    return activateModalFocus(
      sheetRef.current,
      () => onOpenChange(false),
      () => opener ?? null,
    );
  }, [mounted, onOpenChange, open, opener]);

  if (!mounted) {
    return <></>;
  }

  // Portaled to <body> so sticky ancestors cannot clip the full-screen sheet.
  return createPortal(
    <div className={css(styles, 'host')} data-open={open ? 'true' : undefined}>
      <div className={css(styles, 'root')} aria-hidden={open ? 'false' : 'true'}>
        <button
          className={css(styles, 'backdrop')}
          data-modal-backdrop
          tabIndex={-1}
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
        />
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
    </div>,
    document.body,
  );
};
