import { useEffect, useRef, useState } from 'preact/hooks';
import { useInfiniteMedia } from '../hooks/useInfiniteMedia';

interface Props {
  serverUrl: string;
  onSend: (sound: { id: string; url: string; title: string }) => void;
  onClose: () => void;
  onError: (msg: string) => void;
}

const QUICK_SOUNDS = ['Trending', 'Bruh', 'Applause', 'Fail', 'Wow', 'Boom'];

/**
 * Snappy Sound Effects picker with local audio preview, in-memory caching,
 * fast search, quick chips, and VS Code native look.
 */
export function AudioPicker({ serverUrl, onSend, onClose, onError }: Props) {
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { items, loading, loadingMore, hasMore, loadMore } = useInfiniteMedia({
    serverUrl,
    endpoint: 'sounds',
    query,
    onError,
  });

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Toggle preview of sound
  const togglePreview = (id: string, url: string, e: Event) => {
    e.stopPropagation();

    if (previewId === id) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setPreviewId(id);

    audio.play().catch(() => {
      setPreviewId(null);
    });

    audio.onended = () => {
      setPreviewId((curr) => (curr === id ? null : curr));
    };
    audio.onerror = () => {
      setPreviewId(null);
    };
  };

  return (
    <div class="picker" role="dialog" aria-label="Sound picker" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div class="picker-header">
        <div class="picker-title">
          <span class="codicon codicon-unmute" />
          <span>Sounds</span>
          {loading && <span class="codicon codicon-loading codicon-modifier-spin picker-spinner" />}
        </div>
        <button class="picker-close-btn" title="Close sound picker" aria-label="Close sound picker" onClick={onClose}>
          <span class="codicon codicon-close" />
        </button>
      </div>

      <div class="picker-search-bar">
        <span class="codicon codicon-search search-icon" />
        <input
          ref={inputRef}
          class="picker-search"
          type="text"
          placeholder="Search sounds…"
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
        {QUICK_SOUNDS.map((tag) => (
          <button
            key={tag}
            class={`picker-chip ${query.toLowerCase() === (tag === 'Trending' ? '' : tag.toLowerCase()) ? 'active' : ''}`}
            onClick={() => setQuery(tag === 'Trending' ? '' : tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      <div class="picker-list" onScroll={(event) => maybeLoadNext(event.currentTarget, loadMore, hasMore, loadingMore)}>
        {loading && items.length === 0 && <div class="picker-status">Loading sounds…</div>}
        {!loading && items.length === 0 && <div class="picker-status">No sounds found</div>}
        {items.map((s) => {
          const isPlaying = previewId === s.id;
          return (
            <div key={s.id} class={`sound-row ${isPlaying ? 'playing' : ''}`}>
              <button
                class="sound-preview-btn"
                title={isPlaying ? 'Stop preview' : 'Preview sound'}
                onClick={(e) => togglePreview(s.id, s.url, e)}
              >
                <span class={`codicon ${isPlaying ? 'codicon-debug-stop' : 'codicon-play'}`} />
              </button>

              <button
                type="button"
                class="sound-name"
                title={`Click to send "${s.title}"`}
                onClick={() => onSend({ id: s.id, url: s.url, title: s.title })}
              >
                {s.title}
              </button>

              <button
                class="sound-send-btn"
                title={`Send "${s.title}"`}
                onClick={() => onSend({ id: s.id, url: s.url, title: s.title })}
              >
                <span class="codicon codicon-send" />
              </button>
            </div>
          );
        })}
        {loadingMore && <div class="picker-more"><span class="codicon codicon-loading codicon-modifier-spin" /> Loading more sounds…</div>}
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
