import type { ReactNode } from 'react';

import { css } from './react-utils';
import styles from './Toolbar.module.scss';

export interface ToolbarProps {
  children?: ReactNode;
  /** Controls shown before the title. */
  leading?: ReactNode;
  title: string;
}

export const Toolbar = ({ children, leading, title }: ToolbarProps): JSX.Element => {
  return (
    <div className={css(styles, 'root')}>
      {leading}
      <div className={css(styles, 'title')}>{title}</div>
      {children}
    </div>
  );
};
