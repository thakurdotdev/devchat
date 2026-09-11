import { useEffect, useState } from 'preact/hooks';
import type { MediaAttachment } from '@devchat/shared';

interface Props {
  serverUrl: string;
  onSend: (gif: { id: string; url: string; preview: string; title: string }) => void;
  onError: (msg: string) => void;
}

/**
 * GIF picker — debounced search → server proxy (Klipy). Grid renders from
 * `preview` (static jpg); clicking sends the mp4/gif url, never the page link.
 */
export function GifPicker({ serverUrl, onSend, onError }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MediaAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const path = query.trim()
          ? `/api/media/gifs/search?q=${encodeURIComponent(query.trim())}`
          : '/api/media/gifs/trending';
        const res = await fetch(`${serverUrl}${path}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!cancelled) setItems(body.data ?? []);
      } catch {
        if (!cancelled) onError('Could not load GIFs from server');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.trim() ? 350 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, serverUrl]);

  return (
    <div class="picker">
      <input
        class="picker-search"
        type="text"
        placeholder="Search GIFs (empty = trending)…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="picker-grid">
        {loading && <div class="picker-loading">Loading…</div>}
        {!loading && items.length === 0 && <div class="picker-loading">No GIFs found</div>}
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
