import { useEffect, useRef, useState } from "react";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSyncStore } from "@/stores/syncStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKeybind } from "@/lib/keybinds";
import { useKeybindStore } from "@/stores/keybindStore";
import { commands, type SnippetWithTags } from "@/lib/commands";
import { SearchInput } from "./SearchInput";
import { SnippetRow } from "./SnippetRow";
import { EmptyState } from "./EmptyState";
import { FilterChips } from "./FilterChips";
import { LauncherFooter } from "./LauncherFooter";
import { PreviewModal } from "./PreviewModal";
import { Toast } from "../Shared/Toast";
import { ConflictInbox } from "../Sync/ConflictInbox";
import { SyncOnboarding } from "../Sync/SyncOnboarding";
import { useLauncherActions } from "./useLauncherActions";

export function Launcher() {
  const snippets = useSnippetStore((s) => s.snippets);
  const selectedIndex = useSnippetStore((s) => s.selectedIndex);
  const searchQuery = useSnippetStore((s) => s.searchQuery);
  const activeFilters = useSnippetStore((s) => s.activeFilters);
  const moveSelection = useSnippetStore((s) => s.moveSelection);
  const selectIndex = useSnippetStore((s) => s.selectIndex);
  const setQuery = useSnippetStore((s) => s.setQuery);
  const openEditor = useSnippetStore((s) => s.openEditor);
  const openSettings = useSnippetStore((s) => s.openSettings);
  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);
  const syncStatus = useSyncStore((s) => s.status);
  const syncConflicts = useSyncStore((s) => s.conflicts);
  const resolveConflict = useSyncStore((s) => s.resolveConflict);
  const retrySync = useSyncStore((s) => s.retrySync);
  const copyDiagnostics = useSyncStore((s) => s.copyDiagnostics);
  const launcherBinds = useKeybindStore((s) => s.launcherBinds);
  const syncOnboardingDismissed = useSettingsStore((s) => s.syncOnboardingDismissed);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const [previewSnippet, setPreviewSnippet] = useState<SnippetWithTags | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
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
  } = useLauncherActions(selectIndex, refreshSnippets, setQuery, searchQuery);

  useEffect(() => {
    void refreshSnippets();
  }, [refreshSnippets]);

  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useKeybind(launcherBinds, {
    new: () => openEditor(),
    moveUp: () => { setHoveredIndex(null); moveSelection(-1); },
    moveDown: () => { setHoveredIndex(null); moveSelection(1); },
    copy: () => {
      const idx = hoveredIndex ?? selectedIndex;
      const snippet = snippets[idx];
      if (snippet) void commands.copyAndPaste(snippet.id);
    },
    pin: () => {
      const idx = hoveredIndex ?? selectedIndex;
      const snippet = snippets[idx];
      if (snippet) void commands.togglePin(snippet.id).then(() => refreshSnippets());
    },
    edit: () => {
      const idx = hoveredIndex ?? selectedIndex;
      const snippet = snippets[idx];
      if (snippet) openEditor(snippet.id);
    },
    delete: () => {
      const idx = hoveredIndex ?? selectedIndex;
      const id = snippets[idx]?.id;
      if (id) void handleRowDelete(id);
    },
    close: () => void commands.hideWindow(),
  });

  const hasAnySnippets = snippets.length > 0 || searchQuery.length > 0;
  const showOnboarding = !syncStatus?.connected && !syncOnboardingDismissed;

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <SearchInput />
      <FilterChips filters={activeFilters} onClear={handleClearFilter} />
      {showOnboarding && (
        <SyncOnboarding
          onOpenSettings={openSettings}
          onDismiss={() => void setSetting("sync_onboarding_dismissed", "true")}
        />
      )}

      {snippets.length === 0 ? (
        <EmptyState hasSnippets={hasAnySnippets} searchQuery={searchQuery} />
      ) : (
        <div
          ref={listRef}
          className="app-scrollbar flex-1 bg-surface/60 px-[6px] py-[4px] flex flex-col gap-[3px]"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {snippets.map((snippet, index) => (
            <SnippetRow
              key={snippet.id}
              snippet={snippet}
              index={index}
              isSelected={index === selectedIndex}
              isHovered={index === hoveredIndex}
              hasHoverTarget={hoveredIndex !== null}
              onActivate={handleRowActivate}
              onHover={setHoveredIndex}
              onTogglePin={handleRowTogglePin}
              onEdit={openEditor}
              onPreview={setPreviewSnippet}
              onDelete={handleRowDelete}
            />
          ))}
        </div>
      )}

      <LauncherFooter
        syncStatus={syncStatus}
        onRetry={() => void retrySync()}
        onOpenConflicts={() => setShowConflicts(true)}
        onCopyDiagnostics={() => void copyDiagnostics()}
        onOpenSettings={openSettings}
      />

      {previewSnippet && (
        <PreviewModal
          snippet={previewSnippet}
          onClose={() => setPreviewSnippet(null)}
          onEdit={() => {
            setPreviewSnippet(null);
            openEditor(previewSnippet.id);
          }}
          onCopy={() => void commands.copyToClipboard(previewSnippet.id)}
          onPaste={() => void commands.copyAndPaste(previewSnippet.id)}
          onDuplicate={() => void handleDuplicate(previewSnippet.id)}
          onTogglePin={() =>
            void commands.togglePin(previewSnippet.id).then(async () => {
              setPreviewSnippet((cur) => (cur ? { ...cur, pinned: !cur.pinned } : cur));
              await refreshSnippets();
            })
          }
          onOpenConflict={() => setShowConflicts(true)}
        />
      )}

      {showConflicts && (
        <ConflictInbox
          conflicts={syncConflicts}
          onClose={() => setShowConflicts(false)}
          onResolve={async (conflictId, resolution) => {
            await resolveConflict(conflictId, resolution);
            await refreshSnippets();
          }}
        />
      )}

      {pendingDelete && (
        <Toast
          message={`"${pendingDelete.snippet.title || "Untitled"}" deleted.`}
          actionLabel="Undo"
          onAction={() => void handleUndoDelete()}
          onDismiss={() => setPendingDelete(null)}
        />
      )}

      {toastMessage && (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </div>
  );
}
