/** Reads workspace settings for the extension host. */
import * as vscode from "vscode";

export interface ExtensionConfig {
  serverUrl: string;
  nickname: string;
}

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration("devchat");
  return {
    serverUrl: (
      cfg.get<string>("serverUrl") || "http://localhost:3030"
    ).replace(/\/+$/, ""),
    nickname: cfg.get<string>("nickname") || "",
  };
}
