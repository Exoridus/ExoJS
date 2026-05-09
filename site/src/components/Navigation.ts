import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { GUIDE_PARTS } from '../lib/guide-structure';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, ExamplesMap } from '../lib/types';
import type { VersionInfo } from '../lib/versions';
import { buildExampleHref } from '../lib/url-state';
import componentStyles from './Navigation.scss?inline';
import './LoadingSpinner';
import './NavigationLink';
import './NavigationSection';

interface ChapterGroup {
    key: string;
    title: string;
    examples: Array<Example>;
}

interface PartGroup {
    key: string;
    title: string;
    chapters: Array<ChapterGroup>;
}

const TAG_PRIORITY = ['scene', 'input', 'audio', 'fx', 'effects', 'particles', 'rendering', 'debug', 'advanced'] as const;
const MAX_DEFAULT_TAGS = 9;

function normalizeExampleRef(value: string): string {
    return value
        .trim()
        .replace(/^\/+/, '')
        .replace(/\.js$/i, '');
}

@customElement('exo-navigation')
export class Navigation extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ attribute: false }) public examples: ExamplesMap = new Map();
    @property({ attribute: false }) public activeExample: Example | null = null;
    @property({ attribute: false }) public availableTags: Array<string> = [];
    @property({ attribute: false }) public selectedVersion: VersionInfo | null = null;
    @property({ type: String }) public loadError: string | null = null;
    @property({ type: Boolean }) public loaded = false;

    @state() private _searchQuery = '';
    @state() private _activeTagFilter: string | null = null;
    @state() private _showAllTags = false;
    @state() private _overriddenParts: Map<string, boolean> = new Map();
    @state() private _overriddenChapters: Map<string, boolean> = new Map();

    protected override willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
        if (changedProperties.has('activeExample') && (this._overriddenParts.size > 0 || this._overriddenChapters.size > 0)) {
            this._overriddenParts = new Map();
            this._overriddenChapters = new Map();
        }

        if (changedProperties.has('availableTags')) {
            this._showAllTags = false;
        }
    }

    public render(): ReturnType<LitElement['render']> {
        const allTags = this._buildAllTags();
        const defaultTags = this._buildDefaultTags(allTags);
        const activeTag = this._activeTagFilter ?? 'all';
        const visibleTags =
            this._showAllTags || allTags.length <= defaultTags.length
                ? allTags
                : defaultTags.includes(activeTag)
                  ? defaultTags
                  : [...defaultTags, activeTag];
        const canToggleTags = allTags.length > defaultTags.length;
        const hiddenCount = Math.max(0, allTags.length - defaultTags.length);

        return html`
            <section class="side-head">
                <label class="search" for="example-search">
                    <svg class="search-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"></circle>
                        <path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"></path>
                    </svg>
                    <input
                        id="example-search"
                        class="search-input"
                        .value=${this._searchQuery}
                        placeholder="Find an example..."
                        @input=${this._onSearchInput}
                    />
                    <kbd>Ctrl+K</kbd>
                </label>
                <div class="tag-row" ?data-expanded=${this._showAllTags} aria-label="Filter examples by tag">
                    ${visibleTags.map(tag => {
                        const selected = activeTag === tag;
                        return html`
                            <button
                                class="tag-button"
                                type="button"
                                ?data-active=${selected}
                                aria-pressed=${String(selected)}
                                @click=${() => this._onSelectTag(tag)}
                            >
                                ${tag}
                            </button>
                        `;
                    })}
                </div>
                ${canToggleTags
                    ? html`
                          <button
                              class="tag-toggle"
                              type="button"
                              aria-expanded=${String(this._showAllTags)}
                              @click=${this._onToggleTags}
                          >
                              ${this._showAllTags ? 'Show fewer tags' : `Show all tags (${hiddenCount} more)`}
                          </button>
                      `
                    : nothing}
            </section>
            <nav>${this._renderContent()}</nav>
        `;
    }

    private _buildAllTags(): Array<string> {
        return ['all', ...this.availableTags];
    }

    private _buildDefaultTags(allTags: Array<string>): Array<string> {
        const available = new Set(allTags);
        const counts = this._getTagCounts();
        const ordered: string[] = ['all'];

        for (const priorityTag of TAG_PRIORITY) {
            if (available.has(priorityTag)) ordered.push(priorityTag);
        }

        const remaining = allTags
            .filter(tag => tag !== 'all' && !ordered.includes(tag))
            .sort((a, b) => {
                const countDiff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
                if (countDiff !== 0) return countDiff;
                return a.localeCompare(b);
            });

        for (const tag of remaining) {
            if (ordered.length > MAX_DEFAULT_TAGS) break;
            ordered.push(tag);
        }

        return ordered;
    }

    private _getTagCounts(): Map<string, number> {
        const counts = new Map<string, number>();
        const allExamples = Array.from(this.examples.values()).flat();
        for (const example of allExamples) {
            for (const tag of example.tags ?? []) {
                counts.set(tag, (counts.get(tag) ?? 0) + 1);
            }
        }
        return counts;
    }

    private _renderContent(): ReturnType<LitElement['render']> {
        if (this.loadError) return html`<p class="error">${this.loadError}</p>`;
        if (!this.loaded) return html`<exo-spinner centered></exo-spinner>`;

        const groups = this._buildGroups();
        return html`${groups.map(group => this._renderPart(group))}`;
    }

    private _buildGroups(): Array<PartGroup> {
        const allExamples = Array.from(this.examples.values()).flat();
        const examplesByPath = new Map<string, Example>();

        for (const example of allExamples) {
            examplesByPath.set(normalizeExampleRef(example.path), example);
            examplesByPath.set(normalizeExampleRef(example.slug), example);
        }

        return GUIDE_PARTS.map(part => {
            const chapters: Array<ChapterGroup> = part.chapters
                .map(chapter => {
                    const mapped = chapter.examples
                        .map(path => examplesByPath.get(normalizeExampleRef(path)))
                        .filter((example): example is Example => Boolean(example))
                        .filter(example => (this._activeTagFilter ? (example.tags ?? []).includes(this._activeTagFilter) : true))
                        .filter(example => {
                            if (!this._searchQuery.trim()) return true;
                            const query = this._searchQuery.trim().toLowerCase();
                            return (
                                example.title.toLowerCase().includes(query) ||
                                example.path.toLowerCase().includes(query) ||
                                example.description.toLowerCase().includes(query)
                            );
                        });

                    return {
                        key: chapter.path,
                        title: chapter.title,
                        examples: mapped,
                    };
                })
                .filter(chapter => chapter.examples.length > 0);

            return {
                key: part.slug,
                title: part.title,
                chapters,
            };
        }).filter(part => part.chapters.length > 0);
    }

    private _isPartExpanded(group: PartGroup): boolean {
        if (this._overriddenParts.has(group.key)) return this._overriddenParts.get(group.key)!;
        return group.chapters.some(chapter => chapter.examples.some(example => example.path === this.activeExample?.path));
    }

    private _isChapterExpanded(chapter: ChapterGroup): boolean {
        if (this._overriddenChapters.has(chapter.key)) return this._overriddenChapters.get(chapter.key)!;
        return chapter.examples.some(example => example.path === this.activeExample?.path);
    }

    private _renderPart(group: PartGroup): ReturnType<LitElement['render']> {
        const expanded = this._isPartExpanded(group);
        const unavailableCount = group.chapters
            .flatMap(chapter => chapter.examples)
            .filter(example => !getExampleAvailability(example).available).length;

        return html`
            <exo-nav-section
                headline=${group.title}
                .expanded=${expanded}
                .unavailableCount=${unavailableCount}
                @toggle-section=${() => this._onTogglePart(group.key)}
            >
                ${group.chapters.map(chapter => this._renderChapter(chapter))}
            </exo-nav-section>
        `;
    }

    private _renderChapter(chapter: ChapterGroup): ReturnType<LitElement['render']> {
        const expanded = this._isChapterExpanded(chapter);
        return html`
            <section class="chapter">
                <button class="chapter__toggle" type="button" aria-expanded=${String(expanded)} @click=${() => this._onToggleChapter(chapter.key)}>
                    <span class="chapter__title">${chapter.title}</span>
                    <span class="chapter__chevron" ?data-expanded=${expanded}></span>
                </button>
                ${expanded
                    ? html`
                          <div class="chapter__examples">
                              ${chapter.examples.map(example => this._renderLink(example))}
                          </div>
                      `
                    : nothing}
            </section>
        `;
    }

    private _renderLink(example: Example): ReturnType<LitElement['render']> {
        const availability = getExampleAvailability(example);
        const href = buildExampleHref(example.path, this.selectedVersion?.id ?? null);

        return html`
            <exo-nav-link
                href=${href}
                path=${example.path}
                title=${example.title}
                description=${example.description}
                ?active=${this.activeExample?.path === example.path}
                ?unavailable=${!availability.available}
                unavailableReason=${availability.reason ?? ''}
            ></exo-nav-link>
        `;
    }

    private _onSearchInput(event: Event): void {
        this._searchQuery = (event.currentTarget as HTMLInputElement).value;
    }

    private _onSelectTag(tag: string): void {
        this._activeTagFilter = tag === 'all' ? null : tag;
    }

    private _onToggleTags(): void {
        this._showAllTags = !this._showAllTags;
    }

    private _onTogglePart(key: string): void {
        const next = new Map(this._overriddenParts);
        const group = this._buildGroups().find(entry => entry.key === key);
        if (!group) return;
        const current = next.get(key) ?? this._isPartExpanded(group);
        next.set(key, !current);
        this._overriddenParts = next;
    }

    private _onToggleChapter(key: string): void {
        const next = new Map(this._overriddenChapters);
        const groups = this._buildGroups();
        const chapter = groups.flatMap(group => group.chapters).find(entry => entry.key === key);
        if (!chapter) return;
        const current = next.get(key) ?? this._isChapterExpanded(chapter);
        next.set(key, !current);
        this._overriddenChapters = next;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-navigation': Navigation;
    }
}
