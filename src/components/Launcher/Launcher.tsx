import { useCallback, useEffect, useRef, useState } from "react";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useKeybind, LAUNCHER_BINDS } from "@/lib/keybinds";
import { commands, type SnippetWithTags } from "@/lib/commands";
import { SearchInput } from "./SearchInput";
import { SnippetRow } from "./SnippetRow";
import { EmptyState } from "./EmptyState";
import { ShortcutHints } from "./ShortcutHints";
import { FilterChips } from "./FilterChips";
import { Toast } from "../Shared/Toast";

interface PendingDelete {
  snippet: SnippetWithTags;
}

export function Launcher() {
  const snippets = useSnippetStore((s) => s.snippets);
  const selectedIndex = useSnippetStore((s) => s.selectedIndex);
  const searchQuery = useSnippetStore((s) => s.searchQuery);
  const activeTagFilter = useSnippetStore((s) => s.activeTagFilter);
  const moveSelection = useSnippetStore((s) => s.moveSelection);
  const selectIndex = useSnippetStore((s) => s.selectIndex);
  const setQuery = useSnippetStore((s) => s.setQuery);
  const openEditor = useSnippetStore((s) => s.openEditor);
  const openSettings = useSnippetStore((s) => s.openSettings);
  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);
  const closeAfterCopy = useSettingsStore((s) => s.closeAfterCopy);
  const syncStatus = useVaultStore((s) => s.syncStatus);
  const enabled = useVaultStore((s) => s.enabled);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshSnippets();
  }, [refreshSnippets]);

  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleCopy = useCallback(async () => {
    const selected = snippets[selectedIndex];
    if (!selected) return;
    await commands.copyToClipboard(selected.id);
    if (closeAfterCopy) {
      await commands.hideWindow();
    }
  }, [snippets, selectedIndex, closeAfterCopy]);

  const handleNew = useCallback(() => {
    openEditor();
  }, [openEditor]);

  const handleEdit = useCallback(() => {
    const selected = snippets[selectedIndex];
    if (selected) openEditor(selected.id);
  }, [snippets, selectedIndex, openEditor]);

  const handlePin = useCallback(async () => {
    const selected = snippets[selectedIndex];
    if (!selected) return;
    await commands.togglePin(selected.id);
    await refreshSnippets();
  }, [snippets, selectedIndex, refreshSnippets]);

  const handleDelete = useCallback(async () => {
    const selected = snippets[selectedIndex];
    if (!selected) return;
    const deleted = await commands.deleteSnippet(selected.id);
    setPendingDelete({ snippet: deleted });
    await refreshSnippets();
  }, [snippets, selectedIndex, refreshSnippets]);

  const handleUndoDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const s = pendingDelete.snippet;
    await commands.restoreSnippet(s.id, s.title, s.content, s.pinned, s.tags);
    setPendingDelete(null);
    await refreshSnippets();
  }, [pendingDelete, refreshSnippets]);

  const handleClose = useCallback(async () => {
    await commands.hideWindow();
  }, []);

  const handleClearFilter = useCallback(() => {
    setQuery(searchQuery.replace(/#\S+/g, "").replace(/tag:\S+/g, "").trim());
  }, [setQuery, searchQuery]);

  useKeybind(LAUNCHER_BINDS, {
    new: handleNew,
    moveUp: () => moveSelection(-1),
    moveDown: () => moveSelection(1),
    copy: handleCopy,
    pin: handlePin,
    edit: handleEdit,
    delete: handleDelete,
    close: handleClose,
  });

  const hasAnySnippets = snippets.length > 0 || searchQuery.length > 0;

  return (
    <div className="flex flex-col h-full relative">
      <SearchInput />
      <FilterChips activeTag={activeTagFilter} onClear={handleClearFilter} />

      {snippets.length === 0 ? (
        <EmptyState hasSnippets={hasAnySnippets} searchQuery={searchQuery} />
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {snippets.map((snippet, index) => (
            <SnippetRow
              key={snippet.id}
              snippet={snippet}
              index={index}
              isSelected={index === selectedIndex}
              onClick={() => selectIndex(index)}
            />
          ))}
        </div>
      )}

      <div className="h-[32px] flex items-center justify-between border-t border-border">
        <div className="flex items-center gap-sm px-md">
          {enabled && (
            <div className="flex items-center gap-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${
                syncStatus === "idle" ? "bg-green-500" :
                syncStatus === "syncing" ? "bg-yellow-500" :
                syncStatus === "conflicts" ? "bg-red-500" :
                "bg-gray-400"
              }`} />
              <span className="text-snippet-meta text-text-subtle">
                {syncStatus === "idle" ? "Synced" :
                 syncStatus === "syncing" ? "Syncing…" :
                 syncStatus === "conflicts" ? "Conflicts" :
                 ""}
              </span>
            </div>
          )}
        </div>
        <ShortcutHints />
        <div className="flex items-center px-md">
          <button
            onClick={openSettings}
            className="text-text-subtle hover:text-text-primary transition-colors duration-75"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M9.796 1.503a.5.5 0 00-.593 0l-1.518 1.106a6.963 6.963 0 00-1.354.516l-1.78-.264a.5.5 0 00-.536.283L3.32 4.605a.5.5 0 00.104.58l1.26 1.26c-.071.425-.11.862-.11 1.306 0 .444.039.881.11 1.306l-1.26 1.26a.5.5 0 00-.104.58l.695 1.462a.5.5 0 00.536.283l1.78-.264c.416.215.873.388 1.354.516l1.518 1.106a.5.5 0 00.593 0l1.518-1.106c.481-.128.938-.301 1.354-.516l1.78.264a.5.5 0 00.536-.283l.695-1.462a.5.5 0 00-.104-.58l-1.26-1.26c.071-.425.11-.862.11-1.306 0-.444-.039-.881-.11-1.306l1.26-1.26a.5.5 0 00.104-.58l-.695-1.462a.5.5 0 00-.536-.283l-1.78.264a6.963 6.963 0 00-1.354-.516L9.796 1.503zM8 11a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {pendingDelete && (
        <Toast
          message={`"${pendingDelete.snippet.title || "Untitled"}" deleted.`}
          actionLabel="Undo"
          onAction={handleUndoDelete}
          onDismiss={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
