import styles from './DiagnosticsStrip.module.scss';
import type { EditorDiagnostic, EditorDiagnosticSeverity } from './EditorCode';
import { css, cx } from './react-utils';

export interface DiagnosticJumpEvent {
    column: number;
    lineNumber: number;
}

export interface DiagnosticsStripProps {
    diagnostics: ReadonlyArray<EditorDiagnostic>;
    onDiagnosticJump(event: DiagnosticJumpEvent): void;
}

const SEVERITY_RANK: Record<EditorDiagnosticSeverity, number> = {
    error: 3,
    warning: 2,
    info: 1,
    hint: 0,
};

export function DiagnosticsStrip({ diagnostics, onDiagnosticJump }: DiagnosticsStripProps): JSX.Element {
    const top = pickTopDiagnostic(diagnostics);
    const counts = countBySeverity(diagnostics);

    return (
        <div className={css(styles, 'root')} data-has-diagnostics={diagnostics.length > 0 ? 'true' : undefined}>
            {top && (
                <div className={css(styles, 'strip')} data-severity={top.severity} role="status" aria-live="polite" aria-atomic="true">
                    <span className={css(styles, 'severity-dot')} data-severity={top.severity} aria-hidden="true" />
                    <span className={css(styles, 'counts')}>
                        {counts.error > 0 && <span className={cx(css(styles, 'count'), css(styles, 'count--error'))}>{counts.error} error{counts.error === 1 ? '' : 's'}</span>}
                        {counts.warning > 0 && (
                            <span className={cx(css(styles, 'count'), css(styles, 'count--warning'))}>{counts.warning} warning{counts.warning === 1 ? '' : 's'}</span>
                        )}
                        {counts.info > 0 && <span className={cx(css(styles, 'count'), css(styles, 'count--info'))}>{counts.info} info</span>}
                        {counts.error === 0 && counts.warning === 0 && counts.info === 0 && counts.hint > 0 && (
                            <span className={css(styles, 'count')}>{counts.hint} hint{counts.hint === 1 ? '' : 's'}</span>
                        )}
                    </span>
                    <span className={css(styles, 'separator')} aria-hidden="true">
                        .
                    </span>
                    <span className={css(styles, 'message')}>
                        {top.code && <code className={css(styles, 'code')}>ts({top.code})</code>}
                        <span className={css(styles, 'text')} title={top.message}>
                            {top.message}
                        </span>
                    </span>
                    <button
                        className={css(styles, 'jump')}
                        type="button"
                        title={`Jump to line ${top.startLineNumber}`}
                        aria-label={`Jump to line ${top.startLineNumber}`}
                        onClick={() => onDiagnosticJump({ lineNumber: top.startLineNumber, column: top.startColumn })}
                    >
                        Line {top.startLineNumber}
                    </button>
                </div>
            )}
        </div>
    );
}

function countBySeverity(diagnostics: ReadonlyArray<EditorDiagnostic>): Record<EditorDiagnosticSeverity, number> {
    const counts: Record<EditorDiagnosticSeverity, number> = {
        error: 0,
        warning: 0,
        info: 0,
        hint: 0,
    };
    for (const diagnostic of diagnostics) {
        counts[diagnostic.severity] += 1;
    }
    return counts;
}

function pickTopDiagnostic(diagnostics: ReadonlyArray<EditorDiagnostic>): EditorDiagnostic | null {
    let top: EditorDiagnostic | null = null;
    for (const diagnostic of diagnostics) {
        if (!top || SEVERITY_RANK[diagnostic.severity] > SEVERITY_RANK[top.severity]) {
            top = diagnostic;
        }
    }
    return top;
}
