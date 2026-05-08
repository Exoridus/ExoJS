import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Capability } from '../lib/examples-catalog';
import type { Example } from '../lib/types';
import './EditorPreview';

@customElement('guide-example-preview')
export class GuideExamplePreview extends LitElement {
    static styles = css`
        :host {
            display: block;
            border-radius: var(--r-3);
            overflow: hidden;
            border: 1px solid var(--line-soft);
            background: var(--bg-code);
            max-height: 480px;
        }

        exo-preview {
            display: block;
            min-height: 320px;
            max-height: 480px;
        }
    `;

    @property({ type: String }) public chapter = '';
    @property({ type: String }) public slug = '';
    @property({ type: String }) public title = '';
    @property({ type: String }) public sourceCode = '';
    @property({ type: String }) public capabilities = '[]';

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

        return html`<exo-preview .sourceCode=${this.sourceCode} .exampleMeta=${exampleMeta} selectedVersionId="current"></exo-preview>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'guide-example-preview': GuideExamplePreview;
    }
}
