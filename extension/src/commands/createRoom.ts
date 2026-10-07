/** Create an expiring room with optional human-readable name. */
import * as vscode from 'vscode';
import type * as vscodeTypes from 'vscode';
import { createRoom, getRoomPolicy, type RoomPolicy } from '../api/client';
import { getConfig } from '../config';
import { saveRoom } from '../state/session';
import { ChatViewProvider } from '../views/sidebar/ChatViewProvider';

export async function createRoomCommand(
  context: vscodeTypes.ExtensionContext,
  chatProvider: ChatViewProvider,
): Promise<void> {
  try {
    const config = getConfig();
    const policy = await getRoomPolicy(config);
    const ttlHours = await chooseRoomDuration(policy);
    if (ttlHours === undefined) return;
    const name = await chooseRoomName();
    if (name === undefined) return;

    const info = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'DevChat: creating room…' },
      () => createRoom(config, ttlHours, name),
    );
    const roomName = info.name ?? name;
    await saveRoom(context, info.code, roomName);
    await vscode.commands.executeCommand('devchat.chatView.focus');
    chatProvider.notifyRoom(info.code, roomName);
    await vscode.env.clipboard.writeText(info.code);
    const duration = formatDuration(info.ttlHours);
    if (info.durable) {
      void vscode.window.showInformationMessage(`Room ${roomName ? `“${roomName}” ` : ''}${info.code} created for ${duration} — code copied.`);
    } else {
      void vscode.window.showWarningMessage(`Room ${info.code} is set for ${duration}, but the server uses temporary in-memory storage. A server restart can clear it. Configure REDIS_URL for durable rooms.`);
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`DevChat: could not create room — ${(err as Error).message}`);
  }
}

async function chooseRoomName(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Name this room (optional)',
    prompt: 'Give the room a name teammates will recognize, or leave it blank.',
    placeHolder: 'e.g. Design review',
    ignoreFocusOut: true,
    validateInput: (input) => input.trim().length <= 48 ? undefined : 'Room names must be 48 characters or fewer.',
  });
  return value === undefined ? undefined : value.trim();
}

async function chooseRoomDuration(policy: RoomPolicy): Promise<number | undefined> {
  const choices = [1, 24, 24 * 7, 24 * 30, 24 * 90, 24 * 365]
    .filter((hours) => hours <= policy.maxTtlHours);
  if (!choices.includes(policy.defaultTtlHours)) choices.unshift(policy.defaultTtlHours);
  const custom = 'Custom duration…';
  const choice = await vscode.window.showQuickPick([
    ...choices.map((ttlHours) => ({
      label: formatDuration(ttlHours),
      description: ttlHours === policy.defaultTtlHours ? 'Default' : undefined,
      ttlHours,
    })),
    { label: custom, description: `Choose any whole number of hours (up to ${policy.maxTtlHours})`, custom: true },
  ], {
    title: 'Create a DevChat room',
    placeHolder: policy.durable
      ? 'How long should this room and its recent messages stay available?'
      : 'This server uses temporary memory storage; a restart can clear the room.',
    ignoreFocusOut: true,
  });
  if (!choice) return undefined;
  if ('ttlHours' in choice && choice.ttlHours) return choice.ttlHours;
  const input = await vscode.window.showInputBox({
    title: 'Room duration',
    prompt: `Enter a whole number of hours (1–${policy.maxTtlHours}).`,
    value: String(policy.defaultTtlHours),
    ignoreFocusOut: true,
    validateInput: (value) => {
      const hours = Number(value);
      return Number.isInteger(hours) && hours >= 1 && hours <= policy.maxTtlHours
        ? undefined : `Enter a whole number from 1 to ${policy.maxTtlHours}.`;
    },
  });
  return input === undefined ? undefined : Number(input);
}

function formatDuration(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
