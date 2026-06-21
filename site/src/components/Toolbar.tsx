import type { ReactNode } from 'react';

import { css } from './react-utils';
import styles from './Toolbar.module.scss';

export interface ToolbarProps {
    children?: ReactNode;
    title: string;
}

export function Toolbar({ children, title }: ToolbarProps): JSX.Element {
    return (
        <div className={css(styles, 'root')}>
            <div className={css(styles, 'title')}>{title}</div>
            {children}
        </div>
    );
}
