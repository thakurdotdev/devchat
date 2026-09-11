import { useEffect, useRef } from 'preact/hooks';
import type { ChatMessage } from '@devchat/shared';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  youId: string | null;
  typingIds: string[];
  memberName: (id: string) => string;
  onReact: (messageId: string, emoji: string) => void;
}

export function MessageList({ messages, youId, typingIds, memberName, onReact }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const count = messages.length;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, typingIds.length]);

  return (
    <div class="message-list" ref={listRef}>
      {messages.length === 0 && (
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <div>No messages yet — say hi!</div>
        </div>
      )}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} you={m.memberId === youId} youId={youId} onReact={onReact} />
      ))}
      {typingIds.length > 0 && (
        <div class="typing-row">
          {typingIds.map(memberName).join(', ')} {typingIds.length === 1 ? 'is' : 'are'} typing
          <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
      )}
    </div>
  );
}
