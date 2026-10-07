# DevChat

Temporary, authentication-free group chat directly inside VS Code.

DevChat lets you collaborate in real time with teammates through disposable rooms. Share a room code to start messaging without creating an account.

## Features

- **No-auth rooms**: Create or join temporary chat rooms using a room code.
- **VS Code integration**: Automatically follows your active editor theme and font settings.
- **Rich media**: Send text, GIFs, and short audio clips with inline playback and preview.
- **Reactions**: Quick emoji reactions on messages.
- **Room collaboration**: Search recent messages, reply, edit or delete your own text, and pin important messages.
- **Room names and expiry**: Optionally name a room and choose how long it stays available.
- **Mentions and code**: Mention teammates and share fenced code snippets; use `Shift+Enter` for multiline messages.
- **Rejoin**: Leave with confirmation and rejoin the last room from the chat lobby.
- **Notifications**: Optional VS Code toasts and Activity Bar unread counter badge.

## Usage

1. Open **DevChat** from the Activity Bar.
2. Select **Create a room**, choose the room lifetime and optionally name it, or enter an existing room code.
3. Share the code with your collaborators.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `devchat.nickname` | `""` | Custom display nickname (auto-generated if empty). |
| `devchat.notifications.mode` | `"all"` | When to show notification toasts (`all`, `mentions`, `never`). |
| `devchat.notifications.badge` | `true` | Show unread message count on the Activity Bar. |

## License

MIT
