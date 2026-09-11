import { useState, useRef, useEffect } from 'preact/hooks';

interface Props {
  onSend: (text: string) => void;
  onTyping: () => void;
  onOpenGif: () => void;
  onOpenAudio: () => void;
  disabled: boolean;
}

const EMOJIS = ['😀', '😂', '🥲', '😎', '🤔', '👍', '🙏', '🔥', '🎉', '🚀', '💜', '👀', '🤝', '✅', '❌', '🐛'];

export function InputBar({ onSend, onTyping, onOpenGif, onOpenAudio, disabled }: Props) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (showEmoji) inputRef.current?.focus();
  }, [showEmoji]);

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
        <button class="tab" title="Emoji" onClick={() => setShowEmoji((v) => !v)}>😀</button>
        <button class="tab" title="GIFs" onClick={onOpenGif}>GIF</button>
        <button class="tab" title="Sounds" onClick={onOpenAudio}>🎵</button>
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
          placeholder={disabled ? 'Not connected…' : 'Message DevChat room…'}
          disabled={disabled}
          value={text}
          maxLength={2000}
          onInput={(e) => { setText((e.target as HTMLInputElement).value); onTyping(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button class="send-btn" disabled={disabled || !text.trim()} onClick={submit}>➤</button>
      </div>
    </div>
  );
}
