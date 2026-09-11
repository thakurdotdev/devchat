import { useEffect, useState } from 'preact/hooks';
import type { MediaAttachment } from '@devchat/shared';

interface Props {
  serverUrl: string;
  onSend: (sound: { id: string; url: string; title: string }) => void;
  onError: (msg: string) => void;
}

/**
 * Audio picker — search / trending feed via the server proxy (MyInstants).
 * Note: upstream returns no duration — clips load lazily in the player.
 */
export function AudioPicker({ serverUrl, onSend, onError }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MediaAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const path = query.trim()
          ? `/api/media/sounds/search?q=${encodeURIComponent(query.trim())}`
          : '/api/media/sounds/trending';
        const res = await fetch(`${serverUrl}${path}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!cancelled) setItems(body.data ?? []);
      } catch {
        if (!cancelled) onError('Could not load sounds from server');
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
        placeholder="Search sounds (empty = trending)…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="picker-list">
        {loading && <div class="picker-loading">Loading…</div>}
        {!loading && items.length === 0 && <div class="picker-loading">No sounds found</div>}
        {items.map((s) => (
          <button
            key={s.id}
            class="sound-row"
            title={`Send "${s.title}"`}
            onClick={() => onSend({ id: s.id, url: s.url, title: s.title })}
          >
            <span class="sound-icon">🔊</span>
            <span class="sound-name">{s.title}</span>
            <span class="sound-send">send ➤</span>
          </button>
        ))}
      </div>
    </div>
  );
}
