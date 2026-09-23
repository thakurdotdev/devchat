import { useEffect, useRef, useState } from 'preact/hooks';
import type { MediaAttachment } from '@devchat/shared';
import { useInfiniteMedia } from '../hooks/useInfiniteMedia';

interface Props {
  serverUrl: string;
  onSend: (gif: { id: string; url: string; preview: string; title: string }) => void;
  onClose: () => void;
  onError: (msg: string) => void;
}

const QUICK_TAGS = ['Trending', 'Thumbs up', 'Haha', 'Cat', 'Party', 'Code'];

/**
 * Fast, snappy GIF picker with in-memory caching, instant trending,
 * quick tags, and native VS Code search input styling.
 */
export function GifPicker({ serverUrl, onSend, onClose, onError }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { items, loading, loadingMore, hasMore, loadMore } = useInfiniteMedia({
    serverUrl,
    endpoint: 'gifs',
    query,
    onError,
  });

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div class="picker" role="dialog" aria-label="GIF picker" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div class="picker-header">
        <div class="picker-title">
          <span class="codicon codicon-file-media" />
          <span>GIFs</span>
          {loading && <span class="codicon codicon-loading codicon-modifier-spin picker-spinner" />}
        </div>
        <button class="picker-close-btn" title="Close GIF picker" aria-label="Close GIF picker" onClick={onClose}>
          <span class="codicon codicon-close" />
        </button>
      </div>

      <div class="picker-search-bar">
        <span class="codicon codicon-search search-icon" />
        <input
          ref={inputRef}
          class="picker-search"
          type="text"
          placeholder="Search GIFs…"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        {query && (
          <button class="search-clear-btn" title="Clear" onClick={() => setQuery('')}>
            <span class="codicon codicon-close" />
          </button>
        )}
      </div>

      <div class="picker-chips">
        {QUICK_TAGS.map((tag) => (
          <button
            key={tag}
            class={`picker-chip ${query.toLowerCase() === (tag === 'Trending' ? '' : tag.toLowerCase()) ? 'active' : ''}`}
            onClick={() => setQuery(tag === 'Trending' ? '' : tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      <div class="picker-grid" onScroll={(event) => maybeLoadNext(event.currentTarget, loadMore, hasMore, loadingMore)}>
        {loading && items.length === 0 && <div class="picker-status">Loading GIFs…</div>}
        {!loading && items.length === 0 && <div class="picker-status">No GIFs found</div>}
        {items.map((g) => (
          <GifCell key={g.id} item={g} onSend={() => onSend({ id: g.id, url: g.url, preview: g.preview ?? '', title: g.title })} />
        ))}
        {loadingMore && <div class="picker-more"><span class="codicon codicon-loading codicon-modifier-spin" /> Loading more GIFs…</div>}
        {!hasMore && items.length > 0 && <div class="picker-end">You’re all caught up</div>}
      </div>
    </div>
  );
}

function maybeLoadNext(element: HTMLElement, loadMore: () => Promise<void>, hasMore: boolean, loading: boolean): void {
  if (hasMore && !loading && element.scrollHeight - element.scrollTop - element.clientHeight < 100) {
    void loadMore();
  }
}

function GifCell({ item, onSend }: { item: MediaAttachment; onSend: () => void }) {
  const [previewing, setPreviewing] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const videoPreview = /\.(mp4|webm|mov)(\?|$)/i.test(item.url);
  const startPreview = () => {
    setPreviewing(true);
    setPreviewLoaded(false);
    setPreviewFailed(false);
  };
  const stopPreview = () => setPreviewing(false);

  return (
    <button
      class="gif-cell"
      type="button"
      title={item.title}
      aria-label={`Send GIF: ${item.title}`}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
      onClick={onSend}
    >
      {previewing && videoPreview && !previewFailed
        ? <video
            src={item.url}
            poster={item.preview}
            autoplay
            loop
            muted
            playsinline
            preload="metadata"
            onLoadedData={() => setPreviewLoaded(true)}
            onError={() => { setPreviewFailed(true); setPreviewLoaded(true); }}
          />
        : <img
            src={previewing && !previewFailed ? item.url : (item.preview || item.url)}
            alt={item.title}
            loading="lazy"
            onLoad={() => setPreviewLoaded(true)}
            onError={() => { if (previewing) setPreviewFailed(true); }}
          />}
      {previewing && !previewLoaded && !previewFailed && (
        <span class="codicon codicon-loading codicon-modifier-spin gif-preview-loading" aria-hidden="true" />
      )}
    </button>
  );
}
