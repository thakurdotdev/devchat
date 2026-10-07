import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

interface Props {
  onSend: (text: string) => void;
  onTyping: () => void;
  activePicker?: 'gif' | 'audio' | null;
  onOpenGif: () => void;
  onOpenAudio: () => void;
  onClosePickers?: () => void;
  disabled: boolean;
  replyTo?: { name: string; text: string; kind?: 'text' | 'gif' | 'audio' | 'system'; preview?: string } | null;
  onCancelReply?: () => void;
  editText?: string | null;
  onEdit?: (text: string) => void;
  onCancelEdit?: () => void;
  memberNames?: string[];
}

const EMOJIS = ['😀', '😂', '🥲', '😎', '🤔', '👍', '🙏', '🔥', '🎉', '🚀', '💜', '👀', '🤝', '✅', '❌', '🐛'];

export function InputBar({
  onSend, onTyping, activePicker, onOpenGif, onOpenAudio, onClosePickers, disabled,
  replyTo, onCancelReply, editText, onEdit, onCancelEdit, memberNames = [],
}: Props) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const editing = editText !== null && editText !== undefined;

  useEffect(() => {
    if (editing) {
      setText(editText ?? '');
      inputRef.current?.focus();
    }
  }, [editText, editing]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [text]);

  useEffect(() => {
    if (showEmoji) inputRef.current?.focus();
  }, [showEmoji]);

  useEffect(() => {
    if (activePicker) setShowEmoji(false);
  }, [activePicker]);

  const mentionQuery = text.match(/(?:^|\s)@([^\s@]*)$/)?.[1];
  const mentionChoices = useMemo(() => {
    if (mentionQuery === undefined) return [];
    const candidates = [...memberNames, 'everyone', 'here', 'all'];
    return [...new Set(candidates)].filter((name) => name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5);
  }, [memberNames, mentionQuery]);

  const chooseMention = (name: string) => {
    setText((current) => current.replace(/(?:^|\s)@([^\s@]*)$/, (match) => `${match.startsWith(' ') ? ' ' : ''}@${name} `));
    inputRef.current?.focus();
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (editing) onEdit?.(trimmed);
    else onSend(trimmed);
    setText('');
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  const cancelEdit = () => {
    setText('');
    onCancelEdit?.();
  };

  return (
    <div class="input-area">
      {replyTo && !editing && (
        <div class="compose-context">
          {replyTo.kind === 'gif' && replyTo.preview && <img class="reply-preview" src={replyTo.preview} alt="" loading="lazy" />}
          <div class="compose-context-copy"><strong>Replying to {replyTo.name}</strong><span>{replyTo.text}</span></div>
          <button class="icon-btn" title="Cancel reply" aria-label="Cancel reply" onClick={onCancelReply}><span class="codicon codicon-close" /></button>
        </div>
      )}
      {editing && (
        <div class="compose-context">
          <div class="compose-context-copy"><strong>Editing message</strong><span>Changes are visible to everyone in the room.</span></div>
          <button class="icon-btn" title="Cancel edit" aria-label="Cancel edit" onClick={cancelEdit}><span class="codicon codicon-close" /></button>
        </div>
      )}
      {showEmoji && (
        <div class="emoji-grid">
          {EMOJIS.map((emoji) => <button key={emoji} onClick={() => { setText((current) => current + emoji); inputRef.current?.focus(); }}>{emoji}</button>)}
        </div>
      )}
      {mentionChoices.length > 0 && (
        <div class="mention-menu" role="listbox" aria-label="Mention a member">
          {mentionChoices.map((name) => (
            <button key={name} role="option" onClick={() => chooseMention(name)}><span class="codicon codicon-at-sign" /> {name}</button>
          ))}
        </div>
      )}
      <div class="input-tools">
        <button class={`tab ${showEmoji ? 'active' : ''}`} title="Emoji" aria-label="Insert emoji" aria-pressed={showEmoji} onClick={() => { if (!showEmoji && activePicker) onClosePickers?.(); setShowEmoji((v) => !v); }}>
          <span class="codicon codicon-smiley" />
        </button>
        <button class={`tab ${activePicker === 'gif' ? 'active' : ''}`} title="GIFs" aria-label="Choose a GIF" aria-pressed={activePicker === 'gif'} onClick={() => { setShowEmoji(false); onOpenGif(); }}>
          <span class="gif-tab-label">GIF</span>
        </button>
        <button class={`tab ${activePicker === 'audio' ? 'active' : ''}`} title="Sounds" aria-label="Choose a sound" aria-pressed={activePicker === 'audio'} onClick={() => { setShowEmoji(false); onOpenAudio(); }}>
          <span class="codicon codicon-unmute" />
        </button>
      </div>
      <div class="input-row">
        <textarea
          ref={inputRef}
          class="chat-input"
          rows={1}
          placeholder={disabled ? 'Not connected…' : editing ? 'Edit your message…' : 'Type a message…'}
          disabled={disabled}
          value={text}
          maxLength={2000}
          onInput={(event) => { setText((event.target as HTMLTextAreaElement).value); onTyping(); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape' && editing) cancelEdit();
          }}
        />
        <button class="send-btn" disabled={disabled || !text.trim()} onClick={submit} title={editing ? 'Save edit' : 'Send'} aria-label={editing ? 'Save edit' : 'Send'}>
          <span class={`codicon ${editing ? 'codicon-check' : 'codicon-send'}`} />
        </button>
      </div>
      <div class="input-hint">Enter to send · Shift+Enter for a new line</div>
    </div>
  );
}
