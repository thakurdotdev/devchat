/**
 * No-auth identity: random adjective+animal nickname + avatar color,
 * persisted in globalState. User can edit via settings or sidebar.
 */
import * as vscode from 'vscode';

const ADJECTIVES = [
  'swift', 'tiny', 'cosmic', 'grumpy', 'electric', 'silent', 'brave', 'lucky',
  'neon', 'fuzzy', 'quantum', 'hyper', 'mellow', 'ninja', 'pixel', 'rad',
];
const ANIMALS = [
  'otter', 'panda', 'ferret', 'raven', 'koala', 'corgi', 'tamarin', 'axolotl',
  'quokka', 'ibex', 'gecko', 'narwhal', 'puffin', 'lynx', 'tapir', 'yak',
];

const PALETTE = [
  '#7c5cff', '#ff5c8a', '#00b8a9', '#f8a01c', '#4caf50', '#e91e63',
  '#2196f3', '#9c27b0', '#ff7043', '#26c6da', '#8d6e63', '#c0ca33',
];

export interface Identity {
  name: string;
  color: string;
}

const IDENT_KEY = 'devchat.identity';

export async function getIdentity(context: vscode.ExtensionContext): Promise<Identity> {
  let identity = context.globalState.get<Identity>(IDENT_KEY);
  const configured = vscode.workspace.getConfiguration('devchat').get<string>('nickname');
  if (!identity) {
    identity = {
      name: configured || `${pick(ADJECTIVES)}-${pick(ANIMALS)}`,
      color: pick(PALETTE),
    };
    await context.globalState.update(IDENT_KEY, identity);
  }
  return identity;
}

export async function setIdentity(context: vscode.ExtensionContext, identity: Identity): Promise<void> {
  await context.globalState.update(IDENT_KEY, identity);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
