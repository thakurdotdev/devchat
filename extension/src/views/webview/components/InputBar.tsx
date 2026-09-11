import { useState, useRef, useEffect } from 'preact/hooks';

interface Props {
  onSend: (text: string) => void;
  onTyping: () => void;
  activePicker?: 'gif' | 'audio' | null;
  onOpenGif: () => void;
  onOpenAudio: () => void;
  onClosePickers?: () => void;
  disabled: boolean;
}

const EMOJIS = ['😀', '😂', '🥲', '😎', '🤔', '👍', '🙏', '🔥', '🎉', '🚀', '💜', '👀', '🤝', '✅', '❌', '🐛'];

export function InputBar({
  onSend,
  onTyping,
  activePicker,
  onOpenGif,
  onOpenAudio,
  onClosePickers,
  disabled,
}: Props) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (showEmoji) inputRef.current?.focus();
  }, [showEmoji]);

  // If external picker opens, close emoji grid
  useEffect(() => {
    if (activePicker) {
      setShowEmoji(false);
    }
  }, [activePicker]);

  const toggleEmoji = () => {
    if (!showEmoji && activePicker) {
      onClosePickers?.();
    }
    setShowEmoji((v) => !v);
  };

  const handleOpenGif = () => {
    setShowEmoji(false);
    onOpenGif();
  };

  const handleOpenAudio = () => {
    setShowEmoji(false);
    onOpenAudio();
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  return (
    <div class="input-area">
      <div class="tabs">
        <button
          class={`tab ${showEmoji ? 'active' : ''}`}
          title="Emoji"
          onClick={toggleEmoji}
        >
          <span class="codicon codicon-smiley" />
        </button>
        <button
          class={`tab tab-text ${activePicker === 'gif' ? 'active' : ''}`}
          title="GIFs"
          onClick={handleOpenGif}
        >
          GIF
        </button>
        <button
          class={`tab ${activePicker === 'audio' ? 'active' : ''}`}
          title="Sounds"
          onClick={handleOpenAudio}
        >
          <span class="codicon codicon-unmute" />
        </button>
      </div>

      {showEmoji && (
        <div class="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => { setText((t) => t + e); inputRef.current?.focus(); }}>{e}</button>
          ))}
        </div>
      )}

      <div class="input-row">
        <input
          ref={inputRef}
          class="chat-input"
          type="text"
          placeholder={disabled ? 'Not connected…' : 'Type a message…'}
          disabled={disabled}
          value={text}
          maxLength={2000}
          onInput={(e) => { setText((e.target as HTMLInputElement).value); onTyping(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button class="send-btn" disabled={disabled || !text.trim()} onClick={submit} title="Send">
          <span class="codicon codicon-send" />
        </button>
      </div>
    </div>
  );
}
