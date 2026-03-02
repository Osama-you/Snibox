import { useCallback, useEffect, useRef, useState } from "react";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSettingsStore } from "@/stores/settingsStore";
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
  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);
  const closeAfterCopy = useSettingsStore((s) => s.closeAfterCopy);
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

      <ShortcutHints />

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
