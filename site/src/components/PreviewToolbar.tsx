import type { ReactNode, Ref } from 'react';

import styles from './PreviewToolbar.module.scss';
import { css } from './react-utils';

export interface PreviewToolbarProps {
  actionsRef: Ref<HTMLDivElement>;
  leading?: ReactNode;
}

export const PreviewToolbar = ({ actionsRef, leading }: PreviewToolbarProps): JSX.Element => (
  <div className={css(styles, 'root')}>
    {leading}
    <span className={css(styles, 'label')}>Live example</span>
    <div ref={actionsRef} className={css(styles, 'actions')} />
  </div>
);
