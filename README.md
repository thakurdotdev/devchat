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
share the invite. Teammates **Join Room** with the code (or click a
`vscode://devchat.devchat/join/CODE` deep link).

### Configuration

| Setting            | Default                 | Meaning                                           |
| ------------------ | ----------------------- | ------------------------------------------------- |
| `devchat.nickname` | _(auto)_                | Nickname override (auto-generated: `swift-otter`) |

### Server env vars

See `server/.env.example`. Highlights:

- `REDIS_URL` — if set _and_ reachable, the Redis store is used; otherwise the
  in-memory store runs (with a 15-min empty-room grace + hard room TTL).
- `MOCK_MEDIA=true` — serve bundled fixture GIFs/sounds instead of calling the
  upstream APIs (`klipy.thakur.dev` / `myinstants.thakur.dev`). Great for
  offline dev; set `false` in production to proxy the real APIs.

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
- **Room lifecycle** — rooms live 24h max (hard TTL). When the last person
  leaves, a 15-min grace timer runs; anyone rejoining revives the room to full
  TTL. Everyone gets a `room.expiring` warning 2 minutes before death.
- **Rate limiting** — token bucket per connection: 10 text msgs / 5 s, 5 media
  msgs / 10 s. Violations → `error` frame; 3rd strike → kicked.

### REST API

| Method | Route                         | Description                            |
| ------ | ----------------------------- | -------------------------------------- |
| `POST` | `/api/rooms`                  | Create room → `{ code, expiresAt }`    |
| `GET`  | `/api/rooms/:code`            | Room info (exists? member count? TTL?) |
| `GET`  | `/api/media/gifs/search?q=`   | GIF search (proxied Klipy)             |
| `GET`  | `/api/media/gifs/trending`    | GIF trending                           |
| `GET`  | `/api/media/sounds/search?q=` | Sound search (proxied MyInstants)      |
| `GET`  | `/api/media/sounds/trending`  | Sound trending/feed                    |
| `GET`  | `/health`                     | `{ ok, store, uptime, mockMedia }`     |

### WebSocket

Single endpoint: `ws://host/ws?room=CODE&name=NICKNAME&color=HEX`.
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
