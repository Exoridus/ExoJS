import styles from './EditorStatusBar.module.scss';
import { css, cx } from './react-utils';

export interface EditorStatusBarProps {
    column: number;
    dirty: boolean;
    language: string;
    line: number;
    selectionLength: number;
}

export function EditorStatusBar({ column, dirty, language, line, selectionLength }: EditorStatusBarProps): JSX.Element {
    return (
        <div className={css(styles, 'root')}>
            <div className={css(styles, 'left')}>
                <span className={cx(css(styles, 'chip'), css(styles, 'chip--lang'))} title="Language">
                    <span className={css(styles, 'lang-dot')} aria-hidden="true" />
                    <span>{language}</span>
                </span>
            </div>
            <div className={css(styles, 'right')}>
                {selectionLength > 0 && <span className={cx(css(styles, 'chip'), css(styles, 'chip--selection'))}>{selectionLength} selected</span>}
                <span className={cx(css(styles, 'chip'), css(styles, 'chip--cursor'))} title="Cursor position">
                    Ln {line}, Col {column}
                </span>
                <span className={cx(css(styles, 'chip'), css(styles, 'chip--encoding'))} aria-hidden="true">
                    UTF-8 - LF
                </span>
                <span className={cx(css(styles, 'chip'), css(styles, 'chip--dirty'))} data-dirty={dirty ? 'true' : 'false'} title={dirty ? 'Modified' : 'Saved'}>
                    <span className={css(styles, 'dirty-dot')} aria-hidden="true">
                        {dirty ? '*' : 'o'}
                    </span>
                    <span>{dirty ? 'modified' : 'saved'}</span>
                </span>
            </div>
        </div>
    );
}
