import { invoke } from "@tauri-apps/api/core";

export interface Snippet {
  id: string;
  title: string | null;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  use_count: number;
  sync_state: string;
  last_synced_at: string | null;
  remote_version: string | null;
  deleted_at: string | null;
  conflict_parent_id: string | null;
  device_updated_at: string;
}

export interface SnippetWithTags extends Snippet {
  tags: string[];
}

export interface Draft {
  id: string;
  snippet_id: string | null;
  title: string | null;
  content: string | null;
  tags: string | null;
  saved_at: string;
}

export interface VaultStatus {
  enabled: boolean;
  vaultFolder: string | null;
  syncStatus: string;
}

export interface SyncStats {
  imported: number;
  exported: number;
  updated: number;
  conflicts: number;
}

export interface DriveStatus {
  connected: boolean;
  storageMode: string | null;
  syncStatus: string;
  lastSynced: string | null;
  conflictCount: number;
  queueDepth: number;
  lastError: string | null;
  needsReauth: boolean;
}

export interface SyncStatus {
  provider: string;
  connected: boolean;
  syncStatus: string;
  lastSynced: string | null;
  queueDepth: number;
  conflictCount: number;
  lastError: string | null;
  needsReauth: boolean;
}

export interface RemoteSnippetSnapshot {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncConflict {
  id: string;
  snippetId: string;
  reason: string;
  status: string;
  localSnippet: SnippetWithTags;
  remoteSnippet: RemoteSnippetSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface SyncActivityItem {
  id: number;
  level: string;
  action: string;
  message: string;
  snippetId: string | null;
  createdAt: string;
}

export interface OAuthStartResult {
  authUrl: string;
  redirectPort: number;
  codeVerifier: string;
}

export interface SnippetSearchFilters {
  pinnedOnly?: boolean;
  usedRecent?: boolean;
  updatedToday?: boolean;
}

export interface ResolveConflictPayload {
  strategy: "keepLocal" | "keepRemote" | "duplicateBoth" | "mergeManual";
  title?: string | null;
  content?: string | null;
  tags?: string[] | null;
}

export const commands = {
  appReady: () => invoke("app_ready"),

  toggleWindow: () => invoke("toggle_window"),
  showWindow: () => invoke("show_window"),
  hideWindow: () => invoke("hide_window"),
  setWindowSize: (width: number, height: number) =>
    invoke("set_window_size", { width, height }),

  listSnippets: (query?: string, tag?: string, filters?: SnippetSearchFilters) =>
    invoke<SnippetWithTags[]>("list_snippets", {
      query,
      tag,
      pinnedOnly: filters?.pinnedOnly,
      usedRecent: filters?.usedRecent,
      updatedToday: filters?.updatedToday,
    }),
  getSnippet: (id: string) => invoke<SnippetWithTags>("get_snippet", { id }),
  createSnippet: (title: string | null, content: string, tags: string[]) =>
    invoke<SnippetWithTags>("create_snippet", { title, content, tags }),
  updateSnippet: (id: string, title: string | null, content: string, tags: string[]) =>
    invoke<SnippetWithTags>("update_snippet", { id, title, content, tags }),
  deleteSnippet: (id: string) => invoke<SnippetWithTags>("delete_snippet", { id }),
  restoreSnippet: (id: string, title: string | null, content: string, pinned: boolean, tags: string[]) =>
    invoke<SnippetWithTags>("restore_snippet", { id, title, content, pinned, tags }),
  duplicateSnippet: (id: string) => invoke<SnippetWithTags>("duplicate_snippet", { id }),
  togglePin: (id: string) => invoke<boolean>("toggle_pin", { id }),
  recordUsed: (id: string) => invoke("record_used", { id }),
  copyToClipboard: (id: string) => invoke("copy_to_clipboard", { id }),
  copyAndPaste: (id: string) => invoke("copy_and_paste", { id }),
  copyText: (text: string) => invoke("copy_text", { text }),

  getSettings: () => invoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) => invoke("set_setting", { key, value }),

  saveDraft: (snippetId: string | null, title: string, content: string, tags: string[]) =>
    invoke("save_draft", { snippetId, title, content, tags }),
  getDraft: () => invoke<Draft | null>("get_draft"),
  discardDraft: () => invoke("discard_draft"),

  getVaultStatus: () => invoke<VaultStatus>("get_vault_status"),
  setVaultFolder: (path: string) => invoke<SyncStats>("set_vault_folder", { path }),
  clearVaultFolder: () => invoke("clear_vault_folder"),
  exportToVault: () => invoke<number>("export_to_vault"),
  syncVault: () => invoke("sync_vault"),
  exportBackup: () => invoke<number>("export_backup"),
  importBackup: () => invoke("import_backup"),

  driveStartAuth: () => invoke<OAuthStartResult>("drive_start_auth"),
  driveCompleteAuth: (authCode: string, redirectPort: number, codeVerifier: string, storageMode: string) =>
    invoke("drive_complete_auth", { authCode, redirectPort, codeVerifier, storageMode }),
  driveDisconnect: () => invoke("drive_disconnect"),
  driveGetStatus: () => invoke<DriveStatus>("drive_get_status"),
  driveSync: () => invoke("drive_sync"),

  getSyncStatus: () => invoke<SyncStatus>("get_sync_status"),
  retrySync: () => invoke("retry_sync"),
  listSyncConflicts: () => invoke<SyncConflict[]>("list_sync_conflicts"),
  getSyncConflict: (conflictId: string) => invoke<SyncConflict | null>("get_sync_conflict", { conflictId }),
  resolveSyncConflict: (conflictId: string, resolution: ResolveConflictPayload) =>
    invoke("resolve_sync_conflict", { conflictId, resolution }),
  listSyncActivity: (limit?: number) => invoke<SyncActivityItem[]>("list_sync_activity", { limit }),
};
