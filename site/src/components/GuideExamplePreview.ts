import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Capability } from '../lib/examples-catalog';
import type { Example } from '../lib/types';
import { configureUrlsFromLocation } from '../lib/url-builder';
import './EditorPreview';

@customElement('guide-example-preview')
export class GuideExamplePreview extends LitElement {
    static styles = css`
        :host {
            display: block;
            border-radius: var(--r-3);
            overflow: hidden;
            border: 0;
            background: var(--color-code-bg);
            min-height: 280px;
            max-height: 420px;
        }

        exo-preview {
            display: block;
            min-height: 280px;
            max-height: 420px;
        }

        .preview-gate {
            min-height: 280px;
            max-height: 420px;
            display: grid;
            place-content: center;
            gap: var(--s-3);
            padding: var(--s-4);
            box-sizing: border-box;
            background:
                radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 55%),
                var(--bg-code);
        }

        .preview-play {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            border: 1px solid var(--accent-line);
            background: var(--accent-soft);
            color: var(--fg);
            border-radius: var(--r-pill);
            font: inherit;
            font-weight: 600;
            padding: 10px 18px;
            cursor: pointer;
            transition: filter var(--transition-fast);
        }

        .preview-play:hover {
            filter: brightness(1.05);
        }

        .preview-play:focus-visible {
            outline: 2px solid var(--focus-ring);
            outline-offset: 2px;
        }

        .preview-play__icon {
            width: 0;
            height: 0;
            border-top: 7px solid transparent;
            border-bottom: 7px solid transparent;
            border-left: 11px solid currentColor;
        }

        .preview-hint {
            margin: 0;
            text-align: center;
            color: var(--fg-muted);
            font-size: 12px;
            line-height: 1.5;
        }
    `;

    @property({ type: String }) public chapter = '';
    @property({ type: String }) public slug = '';
    @property({ type: String }) public title = '';
    @property({ type: String }) public sourceCode = '';
    @property({ type: String }) public capabilities = '[]';
    @state() private _started = false;

    public override connectedCallback(): void {
        super.connectedCallback();

        // This preview can mount on any page (guide embeds, the landing hero)
        // without an ExampleBrowser present, so configure the URL builders here
        // — otherwise the iframe URL resolves against an empty base and throws.
        configureUrlsFromLocation();
    }

    public override render(): ReturnType<LitElement['render']> {
        let parsedCapabilities: Array<Capability> = [];
        try {
            const raw = JSON.parse(this.capabilities) as unknown;
            if (Array.isArray(raw)) parsedCapabilities = raw as Array<Capability>;
        } catch {
            // attribute is malformed; fall through with empty list
        }

        const exampleMeta: Example = {
            slug: this.slug,
            path: `${this.chapter}/${this.slug}.js`,
            title: this.title || this.slug,
            description: '',
            backend: 'core',
            section: this.chapter,
            tags: [],
            capabilities: parsedCapabilities,
        };

        if (!this._started) {
            const previewTitle = this.title || this.slug;
            return html`
                <div class="preview-gate">
                    <button type="button" class="preview-play" aria-label=${`Play ${previewTitle} preview`} @click=${this._startPreview}>
                        <span class="preview-play__icon" aria-hidden="true"></span>
                        <span>Play Preview</span>
                    </button>
                    <p class="preview-hint">Preview is paused until you click Play.</p>
                </div>
            `;
        }

        return html`<exo-preview .sourceCode=${this.sourceCode} .exampleMeta=${exampleMeta} selectedVersionId="current"></exo-preview>`;
    }

    private _startPreview(): void {
        this._started = true;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'guide-example-preview': GuideExamplePreview;
    }
}
