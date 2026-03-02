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

export const commands = {
  appReady: () => invoke("app_ready"),

  toggleWindow: () => invoke("toggle_window"),
  showWindow: () => invoke("show_window"),
  hideWindow: () => invoke("hide_window"),
  setWindowSize: (width: number, height: number) =>
    invoke("set_window_size", { width, height }),

  listSnippets: (query?: string, tag?: string) =>
    invoke<SnippetWithTags[]>("list_snippets", { query, tag }),
  getSnippet: (id: string) =>
    invoke<SnippetWithTags>("get_snippet", { id }),
  createSnippet: (title: string | null, content: string, tags: string[]) =>
    invoke<SnippetWithTags>("create_snippet", { title, content, tags }),
  updateSnippet: (id: string, title: string | null, content: string, tags: string[]) =>
    invoke<SnippetWithTags>("update_snippet", { id, title, content, tags }),
  deleteSnippet: (id: string) =>
    invoke<SnippetWithTags>("delete_snippet", { id }),
  restoreSnippet: (id: string, title: string | null, content: string, pinned: boolean, tags: string[]) =>
    invoke<SnippetWithTags>("restore_snippet", { id, title, content, pinned, tags }),
  togglePin: (id: string) =>
    invoke<boolean>("toggle_pin", { id }),
  recordUsed: (id: string) =>
    invoke("record_used", { id }),
  copyToClipboard: (id: string) =>
    invoke("copy_to_clipboard", { id }),

  getSettings: () =>
    invoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) =>
    invoke("set_setting", { key, value }),

  saveDraft: (snippetId: string | null, title: string, content: string, tags: string[]) =>
    invoke("save_draft", { snippetId, title, content, tags }),
  getDraft: () =>
    invoke<Draft | null>("get_draft"),
  discardDraft: () =>
    invoke("discard_draft"),
};
