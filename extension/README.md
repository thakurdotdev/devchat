# DevChat

Temporary, authentication-free group chat directly inside VS Code.

DevChat lets you collaborate in real time with teammates through disposable rooms. Share a room code to start messaging without creating an account.

## Features

- **No-auth rooms**: Create or join temporary chat rooms using a room code.
- **VS Code integration**: Automatically follows your active editor theme and font settings.
- **Rich media**: Send text, GIFs, and short audio clips with inline playback and preview.
- **Reactions**: Quick emoji reactions on messages.
- **Notifications**: Optional VS Code toasts and Activity Bar unread counter badge.

## Usage

1. Open **DevChat** from the Activity Bar.
2. Select **Create a room** or enter an existing room code.
3. Share the code with your collaborators.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `devchat.nickname` | `""` | Custom display nickname (auto-generated if empty). |
| `devchat.notifications.mode` | `"all"` | When to show notification toasts (`all`, `mentions`, `never`). |
| `devchat.notifications.badge` | `true` | Show unread message count on the Activity Bar. |

## License

MIT
