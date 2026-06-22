import styles from './LoadingSpinner.module.scss';
import { css, cx } from './react-utils';

export interface LoadingSpinnerProps {
    centered?: boolean;
}

export function LoadingSpinner({ centered = false }: LoadingSpinnerProps): JSX.Element {
    return (
        <div className={cx(css(styles, 'root'), css(styles, 'indicator'), centered && css(styles, 'centered'))}>
            <svg className={css(styles, 'spinner')} viewBox="0 0 100 100" aria-hidden="true">
                <circle className={css(styles, 'path')} cx="50" cy="50" r="20" />
            </svg>
        </div>
    );
}
