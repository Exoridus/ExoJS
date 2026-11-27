import { useEffect, useRef, useState } from 'react';

import { buildPublicUrl } from '../lib/url-builder';
import { findUsedAssets, type UsedAsset } from '../lib/used-assets';
import { css } from './react-utils';
import styles from './UsedAssets.module.scss';

const ASSET_KINDS = { image: 'Image', audio: 'Audio', video: 'Video', text: 'JSON / text', font: 'Font', file: 'File' };

const assetKind = (source: string): keyof typeof ASSET_KINDS => {
  const extension = new URL(source).pathname.split('.').pop()?.toLowerCase() ?? '';

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(extension)) {
    return 'image';
  }

  if (['ogg', 'mp3', 'wav', 'm4a', 'aac', 'flac'].includes(extension)) {
    return 'audio';
  }

  if (['mp4', 'webm', 'mov'].includes(extension)) {
    return 'video';
  }

  if (['json', 'tmj', 'ldtk', 'txt', 'glsl', 'wgsl', 'vert', 'frag'].includes(extension)) {
    return 'text';
  }

  if (['ttf', 'otf', 'woff', 'woff2', 'fnt'].includes(extension)) {
    return 'font';
  }

  return 'file';
};

const AssetPreview = ({ asset }: { asset: UsedAsset }): JSX.Element => {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = assetKind(asset.source);
  const locale = document.documentElement.lang === 'de' ? 'de' : 'en';

  useEffect(() => {
    const request = new AbortController();
    const media = mediaRef.current;

    if (kind === 'text') {
      void fetch(asset.source, { signal: request.signal })
        .then(async response => {
          if (!response.ok) {
            throw new Error(`Could not load the preview (${response.status}).`);
          }

          let value = await response.text();

          try {
            value = JSON.stringify(JSON.parse(value), null, 2);
          } catch {
            // Plain text is a supported preview format.
          }

          if (!request.signal.aborted) {
            setText(value.length > 30_000 ? `${value.slice(0, 30_000)}\n... Preview truncated.` : value);
          }
        })
        .catch(() => {
          if (!request.signal.aborted) {
            setError('Could not load this preview.');
          }
        });
    }

    return () => {
      request.abort();

      if (media) {
        media.pause();
        media.removeAttribute('src');
        media.load();
      }
    };
  }, [asset.source, kind]);

  return (
    <section className={css(styles, 'preview')} aria-label="Asset preview">
      <div className={css(styles, 'preview-header')}>
        <strong>{asset.path}</strong>
        <a
          href={asset.key ? buildPublicUrl(`${locale}/tools/asset-browser/`, { asset: asset.key }) : asset.source}
          target="_blank"
          rel="noopener noreferrer"
        >
          {asset.key ? 'Open in Asset Browser' : 'Open file'}
        </a>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          {kind === 'image' && <img src={asset.source} alt={asset.path} onError={() => setError('Could not load this image.')} />}
          {kind === 'audio' && (
            <audio
              ref={element => {
                mediaRef.current = element;
              }}
              src={asset.source}
              controls
              preload="metadata"
              onError={() => setError('Could not load this audio.')}
            />
          )}
          {kind === 'video' && (
            <video
              ref={element => {
                mediaRef.current = element;
              }}
              src={asset.source}
              controls
              playsInline
              preload="metadata"
              onError={() => setError('Could not load this video.')}
            />
          )}
          {kind === 'text' && (text === null ? <p role="status">Loading preview...</p> : <pre tabIndex={0}>{text}</pre>)}
          {kind === 'font' && <p>Inline font preview is unavailable.</p>}
          {kind === 'file' && <p>No inline preview for this file type.</p>}
        </>
      )}
    </section>
  );
};

export const UsedAssets = ({ sources }: { sources: readonly string[] | null }): JSX.Element | null => {
  const [entries, setEntries] = useState<Array<{ key: string; path: string }>>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const hasSources = Boolean(sources?.length);
  useEffect(() => {
    if (!hasSources) {
      return;
    }

    const request = new AbortController();
    void fetch(buildPublicUrl('vendor/exojs-demo-assets/manifest.json'), { signal: request.signal })
      .then(async response => {
        if (!response.ok) {
          return;
        }

        const manifest = (await response.json()) as { entries?: Array<{ key: string; path: string }> };

        if (!request.signal.aborted && Array.isArray(manifest.entries)) {
          setEntries(manifest.entries);
        }
      })
      .catch(() => undefined);

    return () => request.abort();
  }, [hasSources]);

  if (!sources?.length) {
    return null;
  }

  const assets = findUsedAssets(sources, entries, buildPublicUrl(''));

  if (!assets.length) {
    return null;
  }

  const active = assets.find(asset => asset.source === selected);

  return (
    <details data-used-assets className={css(styles, 'root')} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Assets ({assets.length})</summary>
      {open && (
        <div className={css(styles, 'content')}>
          <ul className={css(styles, 'cards')}>
            {assets.map(asset => (
              <li key={asset.source}>
                <button
                  type="button"
                  aria-pressed={asset.source === selected}
                  title={asset.path}
                  onClick={() => setSelected(current => (current === asset.source ? null : asset.source))}
                >
                  {assetKind(asset.source) === 'image' && <img src={asset.source} alt="" loading="lazy" decoding="async" />}
                  <span className={css(styles, 'kind')}>{ASSET_KINDS[assetKind(asset.source)]}</span>
                  <span className={css(styles, 'filename')}>{asset.path.split('/').pop()}</span>
                </button>
              </li>
            ))}
          </ul>
          {active && <AssetPreview key={active.source} asset={active} />}
        </div>
      )}
    </details>
  );
};
