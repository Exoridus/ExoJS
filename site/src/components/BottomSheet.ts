import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import componentStyles from './BottomSheet.scss?inline';

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

@customElement('exo-bottom-sheet')
export class BottomSheet extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ type: Boolean, reflect: true }) public open = false;
    @property({ type: String }) public title = 'Menu';

    @query('.sheet') private _sheetElement!: HTMLElement;

    @state() private _titleId = `sheet-title-${Math.random().toString(36).slice(2, 9)}`;

    private _opener: HTMLElement | null = null;
    private _inertTargets: Array<{ element: HTMLElement; ariaHidden: string | null }> = [];
    private _boundDocumentKeydown = (event: KeyboardEvent) => this._onDocumentKeydown(event);

    public override connectedCallback(): void {
        super.connectedCallback();
        document.addEventListener('keydown', this._boundDocumentKeydown);
    }

    public override disconnectedCallback(): void {
        document.removeEventListener('keydown', this._boundDocumentKeydown);
        this._disableInertTargets();
        this._unlockBodyScroll();
        super.disconnectedCallback();
    }

    protected override updated(changedProperties: Map<PropertyKey, unknown>): void {
        if (!changedProperties.has('open')) return;

        if (this.open) {
            this._lockBodyScroll();
            this._enableInertTargets();
            this.updateComplete.then(() => this._focusFirstControl());
        } else {
            this._disableInertTargets();
            this._unlockBodyScroll();
            this._restoreFocusToOpener();
        }

        this.dispatchEvent(
            new CustomEvent('sheet-toggle', {
                bubbles: true,
                composed: true,
                detail: { open: this.open },
            })
        );
    }

    public show(opener?: HTMLElement): void {
        this._opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        this.open = true;
    }

    public hide(): void {
        this.open = false;
    }

    public render(): ReturnType<LitElement['render']> {
        return html`
            <div class="root" aria-hidden=${String(!this.open)}>
                <button class="backdrop" type="button" aria-label="Close" @click=${this._onBackdropClick}></button>
                <section class="sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby=${this._titleId}>
                    <div class="handle" aria-hidden="true"></div>
                    <header class="head">
                        <h2 id=${this._titleId} class="title">${this.title}</h2>
                        <button class="close" type="button" @click=${() => this.hide()} aria-label="Close dialog">Close</button>
                    </header>
                    <div class="body">
                        <slot></slot>
                    </div>
                </section>
            </div>
        `;
    }

    private _onBackdropClick(): void {
        this.hide();
    }

    private _onDocumentKeydown(event: KeyboardEvent): void {
        if (!this.open) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.hide();
            return;
        }

        if (event.key !== 'Tab') return;
        const focusables = this._listFocusable();
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
    }

    private _listFocusable(): HTMLElement[] {
        if (!this._sheetElement) return [];
        return Array.from(this._sheetElement.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
            (node): node is HTMLElement => node instanceof HTMLElement && !node.hasAttribute('hidden') && !node.hasAttribute('inert')
        );
    }

    private _focusFirstControl(): void {
        if (!this.open) return;
        const focusables = this._listFocusable();
        const target = focusables[0] ?? this._sheetElement;
        target?.focus();
    }

    private _restoreFocusToOpener(): void {
        if (this._opener instanceof HTMLElement) {
            this._opener.focus();
        }
    }

    private _lockBodyScroll(): void {
        if (scrollLockCount === 0) {
            previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        scrollLockCount += 1;
    }

    private _unlockBodyScroll(): void {
        if (scrollLockCount === 0) return;
        scrollLockCount = Math.max(0, scrollLockCount - 1);
        if (scrollLockCount === 0) {
            document.body.style.overflow = previousBodyOverflow;
        }
    }

    private _enableInertTargets(): void {
        const targets = Array.from(document.querySelectorAll('.app-shell__main')).filter(
            element => element instanceof HTMLElement
        ) as HTMLElement[];

        this._inertTargets = targets.map(element => ({
            element,
            ariaHidden: element.getAttribute('aria-hidden'),
        }));

        for (const target of this._inertTargets) {
            target.element.setAttribute('aria-hidden', 'true');
            (target.element as HTMLElement & { inert?: boolean }).inert = true;
        }
    }

    private _disableInertTargets(): void {
        for (const target of this._inertTargets) {
            (target.element as HTMLElement & { inert?: boolean }).inert = false;
            if (target.ariaHidden === null) {
                target.element.removeAttribute('aria-hidden');
            } else {
                target.element.setAttribute('aria-hidden', target.ariaHidden);
            }
        }
        this._inertTargets = [];
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-bottom-sheet': BottomSheet;
    }
}
