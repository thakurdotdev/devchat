import { useState } from 'preact/hooks';
import type { ChatMessage } from '@devchat/shared';
import { AudioPlayer } from './AudioPlayer';
import { GifMedia } from './GifMedia';

const QUICK_EMOJI = ['👍', '🚀', '😂', '❤️', '🎉', '👀'];

interface Props {
  message: ChatMessage;
  you: boolean;
  youId: string | null;
  showAuthor?: boolean;
  memberName?: (id: string) => string;
  onReact: (messageId: string, emoji: string) => void;
  isGifBlurred: (messageId: string) => boolean;
  onToggleGifBlur: (messageId: string) => void;
}

export function MessageBubble({ message: m, you, youId, showAuthor = true, memberName, onReact, isGifBlurred, onToggleGifBlur }: Props) {
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
      class={`bubble-row ${you ? 'mine' : ''} ${!showAuthor ? 'consecutive' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div class="bubble">
        {showAuthor && (
          <div class="bubble-head">
            <span class="author" style={`color:${m.color}`}>{m.name}</span>
            <span class="time">{fmtTime(m.createdAt)}</span>
          </div>
        )}

        {m.kind === 'text' && <div class="text">{m.text}</div>}

        {m.kind === 'gif' && m.media && (
          <GifMedia
            url={m.media.url}
            preview={m.media.preview}
            title={m.media.title}
            blurred={isGifBlurred(m.id)}
            onToggle={() => onToggleGifBlur(m.id)}
          />
        )}

        {m.kind === 'audio' && m.media && (
          <div class="audio-msg">
            <AudioPlayer src={m.media.url} title={m.media.title} />
          </div>
        )}

        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div class="reactions">
            {Object.entries(m.reactions).map(([emoji, actors]) => {
              const names = actors.map((id) => {
                const name = memberName ? memberName(id) : id;
                return id === youId ? `${name} (you)` : name;
              });
              return (
                <button
                  key={emoji}
                  class={`reaction ${youId && actors.includes(youId) ? 'active' : ''}`}
                  title={names.join(', ')}
                  onClick={() => onReact(m.id, emoji)}
                >
                  {emoji} {actors.length}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hover && (
        <div class="quick-react">
          {QUICK_EMOJI.slice(0, 4).map((e) => (
            <button
              key={e}
              onClick={(ev) => {
                ev.stopPropagation();
                onReact(m.id, e);
                setHover(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
