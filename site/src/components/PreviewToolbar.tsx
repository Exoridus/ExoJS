import type { Ref } from 'react';

import styles from './PreviewToolbar.module.scss';
import { css } from './react-utils';

export interface PreviewToolbarProps {
  actionsRef: Ref<HTMLDivElement>;
}

export const PreviewToolbar = ({ actionsRef }: PreviewToolbarProps): JSX.Element => (
  <div className={css(styles, 'root')}>
    <div ref={actionsRef} className={css(styles, 'actions')} />
  </div>
);
