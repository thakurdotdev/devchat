/**
 * DevChat webview app (Preact). Owns the WebSocket connection; talks to the
 * extension host over postMessage for invite-copy, leave, nickname edits.
 */
import { render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ChatMessage, Member } from '@devchat/shared';
import { TYPING_CLEAR_MS } from '@devchat/shared';
import { ChatSocket, type SocketStatus } from '../../api/socket';
import './styles.css';
import { MessageList } from './components/MessageList';
import { InputBar } from './components/InputBar';
import { GifPicker } from './components/GifPicker';
import { AudioPicker } from './components/AudioPicker';
import { MembersPanel } from './components/MembersPanel';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface Identity {
  id?: string;
  name: string;
  color: string;
  isFirstRun?: boolean;
}

interface Toast {
  id: number;
  kind: 'info' | 'warn' | 'error';
  message: string;
}

type PickerTab = 'gif' | 'audio' | null;
type GifBlurOverrides = Record<string, boolean>;

interface WebviewState {
  gifBlurOverrides?: GifBlurOverrides;
}

function readGifBlurOverrides(state: unknown): GifBlurOverrides {
  const saved = (state as WebviewState | null)?.gifBlurOverrides;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  return Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
}

function App() {
  const vscode = useMemo(() => acquireVsCodeApi(), []);
  const [gifBlurOverrides, setGifBlurOverrides] = useState<GifBlurOverrides>(() => readGifBlurOverrides(vscode.getState()));
  const [blurGifs, setBlurGifs] = useState(false);

  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [identity, setIdentity] = useState<Identity>({ name: '…', color: '#7c5cff' });
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [youId, setYouId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<PickerTab>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0); // drives the expiry countdown re-render

  const socketRef = useRef<ChatSocket | null>(null);
  const connectionKeyRef = useRef('');
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const lastTypingRef = useRef(0);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const youIdRef = useRef<string | null>(youId);
  youIdRef.current = youId;
  const membersRef = useRef<Member[]>(members);
  membersRef.current = members;

  const toast = useCallback((kind: Toast['kind'], message: string) => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // ---------------- messages ----------------

  /** Dedupe by message id (welcome replays history after reconnects). */
  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) seen.set(m.id, m);
      return [...seen.values()].sort((a, b) => a.createdAt - b.createdAt);
    });
  }, []);

  const applyReaction = useCallback((messageId: string, emoji: string, actors: string[] | undefined, removed: boolean) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions ?? {}) };
        if (removed || !actors || actors.length === 0) delete reactions[emoji];
        else reactions[emoji] = actors;
        return { ...m, reactions };
      }),
    );
  }, []);

  const markTyping = useCallback((memberId: string) => {
    setTypingIds((prev) => (prev.includes(memberId) ? prev : [...prev, memberId]));
    const timers = typingTimers.current;
    const existing = timers.get(memberId);
    if (existing) clearTimeout(existing);
    timers.set(memberId, setTimeout(() => {
      setTypingIds((prev) => prev.filter((id) => id !== memberId));
      timers.delete(memberId);
    }, TYPING_CLEAR_MS));
  }, []);

  // ---------------- connection ----------------

  const connect = useCallback((url: string, code: string, id: Identity) => {
    const connectionKey = JSON.stringify([url, code, id.id ?? '', id.name, id.color]);
    if (connectionKeyRef.current === connectionKey && socketRef.current?.canContinue) return;

    socketRef.current?.close();
    connectionKeyRef.current = connectionKey;
    const socket = new ChatSocket(url, code, id, {
      onStatus: (s) => setStatus(s),
      onFrame: (frame) => {
        switch (frame.type) {
          case 'welcome': {
            const you = String(frame.you);
            setYouId(you);
            youIdRef.current = you;
            const initMembers = (frame.members as Member[]) ?? [];
            setMembers(initMembers);
            membersRef.current = initMembers;
            setExpiresAt(Number(frame.expiresAt) || null);
            mergeMessages((frame.recentMessages as ChatMessage[]) ?? []);
            break;
          }
          case 'member.joined':
            if (frame.member) {
              const joinedMember = frame.member as Member;
              setMembers((prev) => [...prev.filter((m) => m.id !== joinedMember.id), joinedMember]);
              if (frame.message) mergeMessages([frame.message as ChatMessage]);
              vscode.postMessage({ cmd: 'memberEvent', kind: 'joined', memberName: joinedMember.name });
            }
            break;
          case 'member.left': {
            const leftMember = membersRef.current.find((m) => m.id === frame.memberId);
            const leftName = leftMember?.name || (frame.message as ChatMessage | undefined)?.name || 'Someone';
            setMembers((prev) => prev.filter((m) => m.id !== frame.memberId));
            setTypingIds((prev) => prev.filter((id2) => id2 !== frame.memberId));
            if (frame.message) mergeMessages([frame.message as ChatMessage]);
            vscode.postMessage({ cmd: 'memberEvent', kind: 'left', memberName: leftName });
            break;
          }
          case 'message':
          case 'gif':
          case 'audio': {
            const incomingMsg = frame as unknown as ChatMessage;
            mergeMessages([incomingMsg]);
            if (incomingMsg.memberId !== youIdRef.current) {
              const isFocused = document.hasFocus() && !document.hidden;
              vscode.postMessage({
                cmd: 'incomingMessage',
                message: incomingMsg,
                isFocused,
              });
            }
            break;
          }
          case 'typing':
            markTyping(String(frame.memberId));
            break;
          case 'react': {
            const reactions = frame.reactions as Record<string, string[]> | undefined;
            const removed = !reactions || !reactions[String(frame.emoji)];
            applyReaction(String(frame.messageId), String(frame.emoji), reactions?.[String(frame.emoji)], removed);
            break;
          }
          case 'room.expiring':
            setExpiresAt(Number(frame.expiresAt) || null);
            toast('warn', String(frame.message ?? 'Room is expiring soon'));
            break;
          case 'error': {
            const code = String(frame.code);
            toast('error', `${code}: ${String(frame.message)}`);
            if (code === 'KICKED' || code === 'ROOM_NOT_FOUND' || code === 'ROOM_EXPIRED' || code === 'ROOM_FULL') {
              socketRef.current?.close();
              setStatus('error');
            }
            break;
          }
        }
      },
    });
    socketRef.current = socket;
    socket.connect();
  }, [applyReaction, markTyping, mergeMessages, toast]);

  // ---------------- host bridge ----------------

  useEffect(() => {
    vscode.postMessage({ cmd: 'ready' });
    const handler = (ev: MessageEvent) => {
      const msg = ev.data ?? {};
      switch (msg.event) {
        case 'init':
          setReady(true);
          setBlurGifs(Boolean(msg.blurGifs));
          if (msg.serverUrl) {
            serverUrlRef.current = msg.serverUrl;
            setServerUrl(msg.serverUrl);
          }
          setIdentity(msg.identity);
          setIsFirstRun(!!msg.identity?.isFirstRun);
          setRoomCode(msg.roomCode);
          if (msg.roomCode && msg.serverUrl) connect(msg.serverUrl, msg.roomCode, msg.identity);
          break;
        case 'mediaConfig':
          setBlurGifs(Boolean(msg.blurGifs));
          setGifBlurOverrides({});
          break;
        case 'room':
          if (msg.roomCode) {
            const effectiveUrl = msg.serverUrl || serverUrlRef.current;
            if (msg.serverUrl) {
              serverUrlRef.current = msg.serverUrl;
              setServerUrl(msg.serverUrl);
            }
            setRoomCode(msg.roomCode);
            setMessages([]);
            setMembers([]);
            setYouId(null);
            if (effectiveUrl) {
              connect(effectiveUrl, msg.roomCode, identityRef.current);
            }
          }
          break;
        case 'identity':
          setIdentity(msg.identity);
          setIsFirstRun(false);
          // reconnect under the new identity if already in a room
          if (roomCodeRef.current && serverUrlRef.current) {
            connect(serverUrlRef.current, roomCodeRef.current, msg.identity);
          }
          break;
        case 'leave':
          socketRef.current?.close();
          connectionKeyRef.current = '';
          setRoomCode(null);
          setMessages([]);
          setMembers([]);
          setYouId(null);
          setStatus('disconnected');
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (messages.length === 0) return;
    const activeGifIds = new Set(messages.filter((message) => message.kind === 'gif').map((message) => message.id));
    setGifBlurOverrides((current) => {
      const entries = Object.entries(current).filter(([id]) => activeGifIds.has(id));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [messages]);

  useEffect(() => {
    vscode.setState({ ...(vscode.getState() as object ?? {}), gifBlurOverrides });
  }, [gifBlurOverrides]);

  // relay status to the extension host (for the Status tree view)
  useEffect(() => {
    vscode.postMessage({ cmd: 'status', status, members, expiresAt, roomCode });
  }, [status, members, expiresAt, roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // countdown ticker
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // clear unread notification badge on user activity or when webview is focused
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const notifyActivity = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
      }, 300);
      vscode.postMessage({ cmd: 'markRead' });
    };

    window.addEventListener('focus', notifyActivity);
    window.addEventListener('pointerdown', notifyActivity, true);
    window.addEventListener('keydown', notifyActivity, true);
    const handleVis = () => {
      if (!document.hidden) notifyActivity();
    };
    document.addEventListener('visibilitychange', handleVis);

    if (!document.hidden) {
      notifyActivity();
    }

    return () => {
      window.removeEventListener('focus', notifyActivity);
      window.removeEventListener('pointerdown', notifyActivity, true);
      window.removeEventListener('keydown', notifyActivity, true);
      document.removeEventListener('visibilitychange', handleVis);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // ---------------- actions ----------------

  const sendText = (text: string) => {
    vscode.postMessage({ cmd: 'markRead' });
    socketRef.current?.send({ type: 'message', text });
  };
  const sendTyping = () => {
    vscode.postMessage({ cmd: 'markRead' });
    const now = Date.now();
    if (now - lastTypingRef.current < 1000) return;
    lastTypingRef.current = now;
    socketRef.current?.send({ type: 'typing' });
  };
  const sendGif = (g: { id: string; url: string; preview: string; title: string }) => {
    vscode.postMessage({ cmd: 'markRead' });
    socketRef.current?.send({ type: 'gif', id: g.id, url: g.url, preview: g.preview, title: g.title });
    setPicker(null);
  };
  const sendAudio = (s: { id: string; url: string; title: string }) => {
    vscode.postMessage({ cmd: 'markRead' });
    socketRef.current?.send({ type: 'audio', id: s.id, url: s.url, title: s.title });
    setPicker(null);
  };
  const react = (messageId: string, emoji: string) => {
    socketRef.current?.send({ type: 'react', messageId, emoji });
  };
  const isGifBlurred = useCallback((messageId: string) => gifBlurOverrides[messageId] ?? blurGifs, [gifBlurOverrides, blurGifs]);
  const toggleGifBlur = useCallback((messageId: string) => {
    setGifBlurOverrides((current) => ({ ...current, [messageId]: !isGifBlurred(messageId) }));
  }, [isGifBlurred]);

  const memberName = useCallback(
    (id: string) => {
      if (id === youId && identity.name) return identity.name;
      const found = members.find((m) => m.id === id);
      if (found) return found.name;
      const msgAuthor = messages.find((m) => m.memberId === id);
      if (msgAuthor) return msgAuthor.name;
      return 'someone';
    },
    [members, messages, youId, identity.name],
  );

  if (!ready) {
    return <div class="boot">DevChat loading…</div>;
  }

  // ---- Phase 1: First-run nickname prompt ----
  if (isFirstRun) {
    return <NicknameScreen identity={identity} vscode={vscode} onDone={() => setIsFirstRun(false)} />;
  }

  if (!roomCode) {
    return (
      <div class="welcome">
        <div class="welcome-header">
          <span class="codicon codicon-comment-discussion welcome-icon" />
          <h3>DevChat</h3>
        </div>
        <p class="welcome-desc">Temporary, no-auth chat rooms for your team — right inside VS Code.</p>
        <div class="welcome-actions">
          <button class="primary-btn" onClick={() => vscode.postMessage({ cmd: 'createRoom' })}>
            <span class="codicon codicon-add" /> Create a room
          </button>
          <button class="secondary-btn" onClick={() => vscode.postMessage({ cmd: 'showJoin' })}>
            <span class="codicon codicon-plug" /> Join with code
          </button>
        </div>
        <p class="hint">
          Chatting as <b style={`color:${identity.color}`}>{identity.name}</b>
          {' · '}
          <button class="link-btn" onClick={() => vscode.postMessage({ cmd: 'setNickname' })}>change</button>
        </p>
      </div>
    );
  }

  const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 60000)) : null;
  void tick;

  return (
    <div class="chat">
      <div class="header">
        <span class="status-dot" data-status={status} title={status} />
        <span class="room-code" title="Room code">{roomCode}</span>
        <span class="spacer" />
        {minutesLeft !== null && status === 'connected' && (
          <span class="expiry" title="Room self-destructs at expiry">
            <span class="codicon codicon-clock" /> {minutesLeft}m
          </span>
        )}
        <button class="icon-btn" title="Members" onClick={() => setShowMembers((v) => !v)}>
          <span class="codicon codicon-organization" /> {members.length}
        </button>
        <button
          class={`icon-btn media-toggle ${blurGifs ? 'active' : ''}`}
          title={`${blurGifs ? 'Disable' : 'Enable'} GIF blur`}
          aria-label={`${blurGifs ? 'Disable' : 'Enable'} GIF blur`}
          aria-pressed={blurGifs}
          onClick={() => vscode.postMessage({ cmd: 'setBlurGifs', value: !blurGifs })}
        >
          <span class={`codicon ${blurGifs ? 'codicon-eye-closed' : 'codicon-eye'}`} />
        </button>
        <button class="icon-btn" title="Copy room code" aria-label="Copy room code" onClick={() => vscode.postMessage({ cmd: 'copyInvite' })}>
          <span class="codicon codicon-copy" />
        </button>
        <button class="icon-btn" title="Leave room" onClick={() => vscode.postMessage({ cmd: 'leave' })}>
          <span class="codicon codicon-close" />
        </button>
      </div>

      {showMembers && <MembersPanel members={members} onEditNickname={() => vscode.postMessage({ cmd: 'setNickname' })} />}

      <MessageList
        messages={messages}
        youId={youId}
        typingIds={typingIds}
        memberName={memberName}
        onReact={react}
        isGifBlurred={isGifBlurred}
        onToggleGifBlur={toggleGifBlur}
      />

      <div class="composer">
        {picker === 'gif' && (
          <GifPicker
            serverUrl={serverUrl}
            onSend={sendGif}
            onClose={() => setPicker(null)}
            onError={(m) => toast('error', m)}
          />
        )}
        {picker === 'audio' && (
          <AudioPicker
            serverUrl={serverUrl}
            onSend={sendAudio}
            onClose={() => setPicker(null)}
            onError={(m) => toast('error', m)}
          />
        )}
        <InputBar
          onSend={sendText}
          onTyping={sendTyping}
          activePicker={picker}
          onOpenGif={() => setPicker((p) => (p === 'gif' ? null : 'gif'))}
          onOpenAudio={() => setPicker((p) => (p === 'audio' ? null : 'audio'))}
          onClosePickers={() => setPicker(null)}
          disabled={status !== 'connected'}
        />
      </div>

      <div class="toasts">
        {toasts.map((t) => (
          <div key={t.id} class={`toast toast-${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </div>
  );
}

// =============================================
// Nickname screen — shown on very first launch
// =============================================

interface NicknameScreenProps {
  identity: Identity;
  vscode: VsCodeApi;
  onDone: () => void;
}

function NicknameScreen({ identity, vscode: vsApi, onDone }: NicknameScreenProps) {
  const [name, setName] = useState(identity.name === '…' ? '' : identity.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      vsApi.postMessage({ cmd: 'saveName', name: trimmed });
    }
    onDone();
  };

  return (
    <div class="nickname-screen">
      <span class="codicon codicon-account nickname-screen-icon" />
      <h3>Welcome to DevChat</h3>
      <p class="nickname-desc">Pick a display name for your chats.</p>
      <div class="nickname-form">
        <input
          ref={inputRef}
          class="chat-input nickname-input"
          type="text"
          placeholder={identity.name}
          value={name}
          maxLength={32}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button class="primary-btn" onClick={submit}>
          Continue <span class="codicon codicon-arrow-right" />
        </button>
      </div>
      <p class="hint">You can change this later from the members panel.</p>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
