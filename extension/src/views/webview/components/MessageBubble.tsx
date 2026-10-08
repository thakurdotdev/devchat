import { useState } from 'preact/hooks';
import type { ChatMessage } from '@devchat/shared';
import { AudioPlayer } from './AudioPlayer';
import { GifMedia } from './GifMedia';

const QUICK_EMOJI = ['👍', '🚀', '😂', '❤️'];

interface Props {
  message: ChatMessage;
  you: boolean;
  youId: string | null;
  showAuthor?: boolean;
  memberName?: (id: string) => string;
  onReact: (messageId: string, emoji: string) => void;
  isGifBlurred: (messageId: string) => boolean;
  onToggleGifBlur: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (messageId: string) => void;
  onPin: (messageId: string, pinned: boolean) => void;
  onJumpToMessage?: (messageId: string) => void;
  flash?: boolean;
}

export function MessageBubble({
  message: m, you, youId, showAuthor = true, memberName, onReact,
  isGifBlurred, onToggleGifBlur, onReply, onEdit, onDelete, onPin, onJumpToMessage, flash,
}: Props) {
  const [hover, setHover] = useState(false);
  const [quickReactOpen, setQuickReactOpen] = useState(false);
  const [replyThumbFailed, setReplyThumbFailed] = useState(false);

  if (m.kind === 'system') {
    return <div class="system-row"><span>{m.text}</span></div>;
  }
  const canEdit = you && m.kind === 'text' && Date.now() - m.createdAt <= 15 * 60_000;

  return (
    <div
      id={`msg-${m.id}`}
      data-message-id={m.id}
      class={`bubble-row ${you ? 'mine' : ''} ${!showAuthor ? 'consecutive' : ''} ${flash ? 'reply-flash' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setQuickReactOpen(false); }}
      onFocusIn={() => setHover(true)}
      onFocusOut={(event) => { if (!(event.relatedTarget instanceof HTMLElement) || !event.currentTarget.contains(event.relatedTarget)) setHover(false); }}
    >
      <div class="bubble">
        {showAuthor && (
          <div class="bubble-head">
            <span class="author" style={`color:${m.color}`}>{m.name}</span>
            <span class="time">{fmtTime(m.createdAt)}</span>
            {m.editedAt && <span class="edited-label">edited</span>}
            {m.pinned && <span class="pinned-label" title="Pinned message"><span class="codicon codicon-pinned" /></span>}
          </div>
        )}
        {m.replyTo && (() => {
          const thumbSrc = m.replyTo.preview ?? (m.replyTo.kind === 'gif' ? m.replyTo.url : undefined);
          const thumb = !replyThumbFailed ? thumbSrc : undefined;
          return (
            <button
              type="button"
              class="reply-quote is-clickable"
              title="Jump to original message"
              aria-label={`Jump to message from ${m.replyTo.name}`}
              onClick={(event) => { event.stopPropagation(); onJumpToMessage?.(m.replyTo!.id); }}
            >
              {m.replyTo.kind === 'gif' && thumb && <img class="reply-preview" src={thumb} alt="" loading="lazy" onError={() => setReplyThumbFailed(true)} />}
              {m.replyTo.kind === 'gif' && !thumb && <span class="reply-preview-icon" aria-hidden="true"><span class="codicon codicon-file-media" /></span>}
              {m.replyTo.kind === 'audio' && <span class="reply-preview-icon" aria-hidden="true"><span class="codicon codicon-unmute" /></span>}
              <span class="reply-quote-copy"><strong>{m.replyTo.name}</strong><span>{m.replyTo.text}</span></span>
              <span class="codicon codicon-arrow-up reply-jump-icon" aria-hidden="true" />
            </button>
          );
        })()}
        {m.kind === 'text' && <div class="text">{renderText(m.text ?? '')}</div>}
        {m.kind === 'gif' && m.media && (
          <GifMedia
            url={m.media.url}
            preview={m.media.preview}
            title={m.media.title}
            blurred={isGifBlurred(m.id)}
            onToggle={() => onToggleGifBlur(m.id)}
          />
        )}
        {m.kind === 'audio' && m.media && <div class="audio-msg"><AudioPlayer src={m.media.url} title={m.media.title} /></div>}
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div class="reactions">
            {Object.entries(m.reactions).map(([emoji, actors]) => {
              const names = actors.map((id) => {
                const name = memberName ? memberName(id) : id;
                return id === youId ? `${name} (you)` : name;
              });
              return (
                <button key={emoji} class={`reaction ${youId && actors.includes(youId) ? 'active' : ''}`} title={names.join(', ')} onClick={() => onReact(m.id, emoji)}>
                  {emoji} {actors.length}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {hover && (
        <div class="message-actions" role="toolbar" aria-label="Message actions">
          <button title="Reply" aria-label="Reply" onClick={() => onReply(m)}><span class="codicon codicon-reply" /></button>
          <div class="quick-react-wrap">
            <button title="Add reaction" aria-label="Add reaction" aria-expanded={quickReactOpen} onClick={() => setQuickReactOpen((value) => !value)}><span class="codicon codicon-smiley" /></button>
            {quickReactOpen && <div class="quick-react">{QUICK_EMOJI.map((emoji) => <button key={emoji} title={emoji} onClick={() => { onReact(m.id, emoji); setQuickReactOpen(false); }}>{emoji}</button>)}</div>}
          </div>
          <button title={m.pinned ? 'Unpin message' : 'Pin message'} aria-label={m.pinned ? 'Unpin message' : 'Pin message'} onClick={() => onPin(m.id, !m.pinned)}><span class={`codicon ${m.pinned ? 'codicon-pinned' : 'codicon-pin'}`} /></button>
          {canEdit && <button title="Edit message" aria-label="Edit message" onClick={() => onEdit(m)}><span class="codicon codicon-edit" /></button>}
          {you && m.kind === 'text' && Date.now() - m.createdAt <= 15 * 60_000 && <button class="delete-action" title="Delete message" aria-label="Delete message" onClick={() => onDelete(m.id)}><span class="codicon codicon-trash" /></button>}
        </div>
      )}
    </div>
  );
}

function renderText(text: string) {
  const pieces = text.split(/(```[\w+-]*\n[\s\S]*?```)/g);
  return pieces.map((part, index) => {
    const match = part.match(/^```([\w+-]*)\n([\s\S]*?)```$/);
    if (!match) return <span key={index}>{part}</span>;
    return <pre class="code-block" key={index}><code data-language={match[1] || undefined}>{match[2].replace(/\n$/, '')}</code></pre>;
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
