import { useCallback, useState } from "react";
import { commands, type SnippetWithTags } from "@/lib/commands";

export interface PendingDelete {
  snippet: SnippetWithTags;
}

export interface LauncherActionsResult {
  pendingDelete: PendingDelete | null;
  setPendingDelete: (value: PendingDelete | null) => void;
  toastMessage: string | null;
  setToastMessage: (value: string | null) => void;
  handleRowActivate: (index: number, snippetId: string) => void;
  handleRowTogglePin: (snippetId: string) => Promise<void>;
  handleRowDelete: (snippetId: string) => Promise<void>;
  handleDuplicate: (id: string) => Promise<void>;
  handleClearFilter: (filter: string) => void;
  handleUndoDelete: () => Promise<void>;
}

export function useLauncherActions(
  selectIndex: (index: number) => void,
  refreshSnippets: () => Promise<void>,
  setQuery: (query: string) => void,
  searchQuery: string,
): LauncherActionsResult {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleRowActivate = useCallback(
    (index: number, snippetId: string) => {
      selectIndex(index);
      void commands.copyAndPaste(snippetId);
    },
    [selectIndex],
  );

  const handleRowTogglePin = useCallback(
    async (snippetId: string) => {
      await commands.togglePin(snippetId);
      await refreshSnippets();
    },
    [refreshSnippets],
  );

  const handleRowDelete = useCallback(
    async (snippetId: string) => {
      const deleted = await commands.deleteSnippet(snippetId);
      setPendingDelete({ snippet: deleted });
      await refreshSnippets();
    },
    [refreshSnippets],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      await commands.duplicateSnippet(id);
      await refreshSnippets();
      setToastMessage("Snippet duplicated.");
    },
    [refreshSnippets],
  );

  const handleClearFilter = useCallback(
    (filter: string) => {
      const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      setQuery(
        searchQuery
          .replace(new RegExp(`(^|\\s)${escaped}`, "g"), " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    },
    [setQuery, searchQuery],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { snippet } = pendingDelete;
    await commands.restoreSnippet(
      snippet.id,
      snippet.title,
      snippet.content,
      snippet.pinned,
      snippet.tags,
    );
    setPendingDelete(null);
    await refreshSnippets();
  }, [pendingDelete, refreshSnippets]);

  return {
    pendingDelete,
    setPendingDelete,
    toastMessage,
    setToastMessage,
    handleRowActivate,
    handleRowTogglePin,
    handleRowDelete,
    handleDuplicate,
    handleClearFilter,
    handleUndoDelete,
  };
}
