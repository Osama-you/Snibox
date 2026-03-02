import { useCallback, useEffect } from "react";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKeybind, LAUNCHER_BINDS } from "@/lib/keybinds";
import { commands } from "@/lib/commands";
import { SearchInput } from "./SearchInput";
import { SnippetRow } from "./SnippetRow";
import { EmptyState } from "./EmptyState";
import { ShortcutHints } from "./ShortcutHints";

export function Launcher() {
  const snippets = useSnippetStore((s) => s.snippets);
  const selectedIndex = useSnippetStore((s) => s.selectedIndex);
  const searchQuery = useSnippetStore((s) => s.searchQuery);
  const moveSelection = useSnippetStore((s) => s.moveSelection);
  const selectIndex = useSnippetStore((s) => s.selectIndex);
  const openEditor = useSnippetStore((s) => s.openEditor);
  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);
  const closeAfterCopy = useSettingsStore((s) => s.closeAfterCopy);

  useEffect(() => {
    refreshSnippets();
  }, [refreshSnippets]);

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
    await commands.deleteSnippet(selected.id);
    await refreshSnippets();
  }, [snippets, selectedIndex, refreshSnippets]);

  const handleClose = useCallback(async () => {
    await commands.hideWindow();
  }, []);

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

  const hasSnippets = snippets.length > 0 || searchQuery.length > 0;

  return (
    <div className="flex flex-col h-full">
      <SearchInput />

      {snippets.length === 0 ? (
        <EmptyState
          hasSnippets={hasSnippets}
          searchQuery={searchQuery}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
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
    </div>
  );
}
