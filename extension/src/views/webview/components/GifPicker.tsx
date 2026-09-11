import { useEffect, useRef, useState } from 'preact/hooks';
import type { MediaAttachment } from '@devchat/shared';

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
  const [items, setItems] = useState<MediaAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef<Map<string, MediaAttachment[]>>(new Map());
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Snappy fetch with caching & 150ms debounce
  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    const cacheKey = trimmed.toLowerCase();

    // Instant cache hit
    if (cacheRef.current.has(cacheKey)) {
      setItems(cacheRef.current.get(cacheKey)!);
      setLoading(false);
      return;
    }

    setLoading(true);
    const delay = trimmed ? 150 : 0;
    const t = setTimeout(async () => {
      try {
        const path = trimmed
          ? `/api/media/gifs/search?q=${encodeURIComponent(trimmed)}`
          : '/api/media/gifs/trending';
        const res = await fetch(`${serverUrl}${path}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        const data: MediaAttachment[] = body.data ?? [];
        if (!cancelled) {
          cacheRef.current.set(cacheKey, data);
          setItems(data);
        }
      } catch {
        if (!cancelled) onError('Could not load GIFs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, serverUrl]);

  return (
    <div class="picker">
      <div class="picker-header">
        <div class="picker-title">
          <span class="codicon codicon-file-media" />
          <span>GIFs</span>
          {loading && <span class="codicon codicon-loading codicon-modifier-spin picker-spinner" />}
        </div>
        <button class="picker-close-btn" title="Close" onClick={onClose}>
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

      <div class="picker-grid">
        {loading && items.length === 0 && <div class="picker-status">Loading GIFs…</div>}
        {!loading && items.length === 0 && <div class="picker-status">No GIFs found</div>}
        {items.map((g) => (
          <button
            key={g.id}
            class="gif-cell"
            title={g.title}
            onClick={() => onSend({ id: g.id, url: g.url, preview: g.preview ?? '', title: g.title })}
          >
            <img src={g.preview} alt={g.title} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
