import type { Ref } from 'react';

import styles from './PreviewToolbar.module.scss';
import { css, cx } from './react-utils';

export interface SidebarToggleProps {
  open: boolean;
  toggleRef: Ref<HTMLButtonElement>;
  onToggle(): void;
}

/** Shows or hides the example list. Lives in the header of whichever card sits next to it. */
export const SidebarToggle = ({ open, toggleRef, onToggle }: SidebarToggleProps): JSX.Element => (
  <button
    ref={toggleRef}
    className={cx(css(styles, 'button'), css(styles, 'button--icon'))}
    type="button"
    title={open ? 'Hide example list' : 'Show example list'}
    aria-label={open ? 'Hide example list' : 'Show example list'}
    aria-expanded={open}
    aria-controls="playground-navigation"
    onClick={onToggle}
  >
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  </button>
);

export interface SwapButtonProps {
  onSwap(): void;
}

/** Swaps the editor and the preview in the split layout. Lives in the header of the card on the right. */
export const SwapButton = ({ onSwap }: SwapButtonProps): JSX.Element => (
  <button
    className={cx(css(styles, 'button'), css(styles, 'button--icon'))}
    type="button"
    title="Swap the editor and the preview"
    aria-label="Swap the editor and the preview"
    onClick={onSwap}
  >
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M3 7h11M11 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 13H6M9 10l-3 3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
);
