import { useState } from 'preact/hooks';
import type { ChatMessage } from '@devchat/shared';

const QUICK_EMOJI = ['👍', '🚀', '😂', '❤️', '🎉', '👀'];

interface Props {
  message: ChatMessage;
  you: boolean;
  youId: string | null;
  onReact: (messageId: string, emoji: string) => void;
}

export function MessageBubble({ message: m, you, youId, onReact }: Props) {
  const [hover, setHover] = useState(false);

  if (m.kind === 'system') {
    return (
      <div class="system-row">
        <span>{m.text}</span>
      </div>
    );
  }

  return (
    <div
      class={`bubble-row ${you ? 'mine' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div class="bubble" style={`border-left-color:${m.color}`}>
        <div class="bubble-head">
          <span class="author" style={`color:${m.color}`}>{m.name}</span>
          <span class="time">{fmtTime(m.createdAt)}</span>
        </div>

        {m.kind === 'text' && <div class="text">{m.text}</div>}

        {m.kind === 'gif' && m.media && (
          isVideo(m.media.url)
            ? <video class="gif" src={m.media.url} poster={m.media.preview} autoplay loop muted playsinline />
            : <img class="gif" src={m.media.url} alt={m.media.title} loading="lazy" />
        )}

        {m.kind === 'audio' && m.media && (
          <div class="audio-msg">
            <span class="audio-title">🎧 {m.media.title}</span>
            <audio controls preload="none" src={m.media.url} />
          </div>
        )}

        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div class="reactions">
            {Object.entries(m.reactions).map(([emoji, actors]) => (
              <button
                key={emoji}
                class={`reaction ${youId && actors.includes(youId) ? 'active' : ''}`}
                title={actors.join(', ')}
                onClick={() => onReact(m.id, emoji)}
              >
                {emoji} {actors.length}
              </button>
            ))}
          </div>
        )}
      </div>

      {(hover || Object.keys(m.reactions ?? {}).length > 0) && (
        <div class="quick-react">
          {QUICK_EMOJI.slice(0, 4).map((e) => (
            <button key={e} onClick={() => onReact(m.id, e)}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('.mp4');
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
