import { useEffect, useRef, useState } from 'preact/hooks';
import type { MediaAttachment } from '@devchat/shared';

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
  const [items, setItems] = useState<MediaAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, MediaAttachment[]>>(new Map());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Snappy fetch with cache & 150ms debounce
  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    const cacheKey = trimmed.toLowerCase();

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
          ? `/api/media/sounds/search?q=${encodeURIComponent(trimmed)}`
          : '/api/media/sounds/trending';
        const res = await fetch(`${serverUrl}${path}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        const data: MediaAttachment[] = body.data ?? [];
        if (!cancelled) {
          cacheRef.current.set(cacheKey, data);
          setItems(data);
        }
      } catch {
        if (!cancelled) onError('Could not load sounds');
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
          <span class="codicon codicon-unmute" />
          <span>Sounds</span>
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

      <div class="picker-list">
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

              <span
                class="sound-name"
                title={`Click to send "${s.title}"`}
                onClick={() => onSend({ id: s.id, url: s.url, title: s.title })}
              >
                {s.title}
              </span>

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
      </div>
    </div>
  );
}
