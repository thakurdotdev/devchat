# DevChat

**Temporary, no-auth chat rooms for VS Code.** Chat, share GIFs and audio clips
with your team in real time — no signup, no login, just a room code.

```
┌─────────────────────────────┐
│ 🔗 room: KX7P-2MA   [copy] │  ← sidebar header
│  swift-otter                │
│  anyone up for review?      │
│  🎧 [▶ play] airhorn         │
│  tiny-panda  [GIF]          │
├─────────────────────────────┤
│ [ 😀 ] [ GIF ] [ 🎵 ]       │
│ [input...............] [➤]  │
└─────────────────────────────┘
```

## Monorepo layout (Bun workspaces)

| Path              | What it is                                                             |
| ----------------- | ---------------------------------------------------------------------- |
| `packages/shared` | WS event schemas (TypeBox) + domain types shared by server & extension |
| `server`          | Bun + Elysia server: REST, WebSocket hub, media proxy, store layer     |
| `extension`       | VS Code extension: sidebar webview chat (Preact), commands, deep links |

## Quick start

```bash
bun install

# 1) Run the server (in-memory store, mock media — zero external deps)
cp server/.env.example server/.env
bun run dev:server          # → http://localhost:3030

# 2) Build + run the extension
cd extension
bun run compile             # bundles dist/extension.js + dist/webview.js
# open the repo root in VS Code, press F5 (Run Extension),
# or install: npx @vscode/vsce package && code --install-extension devchat-extension-0.1.1.vsix
```

In VS Code: click the DevChat icon in the activity bar → **Create a room** →
optionally name it and share the room code. Teammates **Join Room** with the code (or click a
`vscode://devchat.devchat/join/CODE` deep link).

Recent messages can be searched and pinned messages filtered from the room header. Pin up to 10 room messages. Reply to a message from its action bar; edit and delete are available on your own text messages for 15 minutes. Use `Shift+Enter` for multiline messages, triple backticks for code blocks, and `@` to mention a room member.
The room header shows its optional name and keeps actions on a separate row for
narrow sidebars. Leaving asks for confirmation; the lobby keeps a one-click
rejoin action for the most recent room.

### Configuration

| Setting            | Default                 | Meaning                                           |
| ------------------ | ----------------------- | ------------------------------------------------- |
| `devchat.nickname` | _(auto)_                | Nickname override (auto-generated: `swift-otter`) |

### Server env vars

See `server/.env.example`. Highlights:

- `REDIS_URL` — if set _and_ reachable, the Redis store is used; otherwise the
  in-memory store runs. Redis is required to preserve rooms across server restarts.
- `ROOM_TTL_HOURS` — default room lifetime (24 hours by default).
- `MAX_ROOM_TTL_HOURS` — maximum lifetime users may select when creating rooms
  (2160 hours / 90 days by default, with a hard maximum of one year).
- `MOCK_MEDIA=true` — serve bundled fixture GIFs/sounds instead of calling the
  upstream APIs (`klipy.thakur.dev` / `myinstants.thakur.dev`). Great for
  offline dev; set `false` in production to proxy the real APIs.
- Abuse controls are configurable in `server/.env.example`: room creation,
  lookups, joins, media requests, WebSocket connections, frame rate, and frame
  size. Defaults are sized for ordinary team use. Redis makes IP quotas shared
  across instances; in-memory mode limits only that server process.
- `TRUST_PROXY=true` uses `CF-Connecting-IP` or the first `X-Forwarded-For`
  address for IP limits. Enable it only when the app is reachable through a
  trusted proxy that overwrites those headers. Otherwise clients can spoof them.
- `ALLOWED_WS_ORIGINS` optionally restricts browser WebSocket origins by exact
  comma-separated match. Leave empty for VS Code's dynamically generated
  webview origins; native clients without an `Origin` header remain supported.
- Room codes are capability secrets: use TLS in production and avoid posting
  room codes in public channels. New rooms use 12-character codes; existing
  7-character rooms remain joinable until they expire.

## Architecture notes

- **Webview owns the WS.** One socket, one reconnect loop (1s→2s→…→30s
  backoff, 25s heartbeat pings, server kills silent sockets after 60s). The
  extension host only does REST (create/join room) and persists the room code
  in `workspaceState`.
- **Store interface** (`server/src/store/interface.ts`) — Redis and in-memory
  implementations are swapped by a single factory (`getStore()`). Redis keys:
  `room:{code}`, `room:{code}:members`, `room:{code}:messages` (ring buffer of
  the last 100 messages), `cache:{kind}:{hash}` for the media proxy.
- **Media proxy** (`server/src/routes/media.ts`) — CORS-safe server-side proxy
  with TTL caching. `server/src/utils/adapters.ts` normalizes raw Klipy /
  MyInstants payloads into one shape (`preview` jpg for the picker grid,
  `mp4 ?? gif` for sent messages) so upstream drift never leaks downstream.
- **Room lifecycle** — the creator selects a lifetime, bounded by
  `MAX_ROOM_TTL_HOURS`. Rooms remain joinable while empty until that expiry.
  Redis expires room, member, and message keys directly; the memory store uses
  one shared 30-second cleanup sweep. Active members receive an expiry warning
  2 minutes before the room closes. No per-room polling runs while rooms are idle.
- **Rate limiting** — per-connection message limits plus shared per-IP quotas
  for room creation, lookup, joining, and media requests. WebSocket peers are
  capped by IP and globally, pre-join sockets time out after 10 seconds, and
  frames are bounded to 16 KiB by default. Redis-backed quotas are atomic across
  server instances.

### REST API

| Method | Route                         | Description                            |
| ------ | ----------------------------- | -------------------------------------- |
| `GET`  | `/api/rooms/policy`           | Room duration policy and storage durability |
| `POST` | `/api/rooms`                  | Create room with `{ ttlHours }` → code and expiry |
| `GET`  | `/api/rooms/:code`            | Room info (exists? member count? TTL?) |
| `GET`  | `/api/media/gifs/search?q=`   | GIF search (proxied Klipy)             |
| `GET`  | `/api/media/gifs/trending`    | GIF trending                           |
| `GET`  | `/api/media/sounds/search?q=` | Sound search (proxied MyInstants)      |
| `GET`  | `/api/media/sounds/trending`  | Sound trending/feed                    |
| `GET`  | `/health`                     | `{ ok, store, uptime, mockMedia }`     |

### WebSocket

Single endpoint: `wss://host/ws`; the first `join` frame carries the room code,
display name, and color so these values do not appear in proxy URL logs.
Client events: `join`, `message`, `gif`, `audio`, `typing`, `react`, `leave`,
`ping`. Server events: `welcome`, `member.joined`, `member.left`, `message`,
`gif`, `audio`, `typing`, `react`, `error`, `room.expiring`. All inbound
frames are validated with TypeBox schemas from `@devchat/shared`.

### Deploy the server

```bash
cd server && docker build -t devchat-server .
docker run -p 3030:3030 -e REDIS_URL=redis://… devchat-server
```

(Fly.io / Railway / any VPS with Bun works too: `bun run --cwd server start`.)

## Development

```bash
bun run dev:server        # hot-reload server
bun run dev:ext           # watch-build extension + webview
bun run typecheck         # tsc over shared + server
bun test                  # (tests not included in this MVP pass)
```

## Known limitations (MVP scope)

- GIF `stickers`/`clips` upstream types are intentionally out of scope.
- Audio clip durations are unknown (MyInstants returns none) — the inline
  player just shows the browser default.
- Webview CSP allows `img-src https:` / `media-src https:` broadly since media
  is served from third-party CDNs; tighten once CDN hosts are confirmed stable.
