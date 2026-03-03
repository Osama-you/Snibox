import { useEffect, useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useDriveStore } from "@/stores/driveStore";
import { commands, type Draft } from "@/lib/commands";
import { WINDOW } from "@/styles/tokens";
import { Launcher } from "@/components/Launcher/Launcher";
import { Editor } from "@/components/Editor/Editor";
import { Settings } from "@/components/Settings/Settings";
import { RestoreDraft } from "@/components/Shared/RestoreDraft";
import { UpdateBanner } from "@/components/Shared/UpdateBanner";

export default function App() {
  const mode = useSnippetStore((s) => s.mode);
  const openEditor = useSnippetStore((s) => s.openEditor);
  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const closeOnBlur = useSettingsStore((s) => s.closeOnBlur);
  const initEditor = useEditorStore((s) => s.initEditor);
  const loadVaultStatus = useVaultStore((s) => s.loadVaultStatus);
  const loadDriveStatus = useDriveStore((s) => s.loadDriveStatus);
  const setDriveSyncStatus = useDriveStore((s) => s.setSyncStatus);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);

  useEffect(() => {
    loadSettings();
    loadVaultStatus();
    loadDriveStatus();
    commands.appReady();

    commands.getDraft().then((draft) => {
      if (draft && (draft.title || draft.content)) {
        setPendingDraft(draft);
      }
    });
  }, [loadSettings, loadVaultStatus, loadDriveStatus]);

  useEffect(() => {
    const height = mode === "editor" || mode === "settings" ? WINDOW.editorHeight : WINDOW.launcherHeight;
    commands.setWindowSize(WINDOW.launcherWidth, height);
  }, [mode]);

  useEffect(() => {
    const unlistenWindowShown = listen("window-shown", () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        'input[placeholder="Search snippets..."]',
      );
      searchInput?.focus();
      searchInput?.select();
    });
    
    const unlistenVaultChanged = listen("vault-snippets-changed", async () => {
      try {
        await commands.syncVault();
      } catch {
        // vault may have been disabled mid-flight; ignore
      }
      refreshSnippets();
    });

    const unlistenDriveStatus = listen<string>("drive-sync-status", (event) => {
      setDriveSyncStatus(event.payload as "idle" | "syncing" | "error" | "auth_needed" | "offline");
      if (event.payload === "idle") {
        refreshSnippets();
      }
    });

    const unlistenDriveAuth = listen("drive-auth-needed", () => {
      setDriveSyncStatus("auth_needed");
    });

    return () => {
      unlistenWindowShown.then((fn) => fn());
      unlistenVaultChanged.then((fn) => fn());
      unlistenDriveStatus.then((fn) => fn());
      unlistenDriveAuth.then((fn) => fn());
    };
  }, [refreshSnippets, setDriveSyncStatus]);

  const handleBlur = useCallback(() => {
    if (mode === "launcher" && closeOnBlur) {
      setTimeout(() => {
        if (!document.hasFocus()) {
          commands.hideWindow();
        }
      }, 100);
    }
  }, [mode, closeOnBlur]);

  useEffect(() => {
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [handleBlur]);

  const handleRestoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    const tags: string[] = pendingDraft.tags
      ? JSON.parse(pendingDraft.tags)
      : [];
    initEditor(pendingDraft.title || "", pendingDraft.content || "", tags);
    openEditor(pendingDraft.snippet_id ?? undefined);
    setPendingDraft(null);
  }, [pendingDraft, initEditor, openEditor]);

  const handleDiscardDraft = useCallback(async () => {
    await commands.discardDraft();
    setPendingDraft(null);
  }, []);

  return (
    <div className="window-container">
      {mode === "launcher" && <UpdateBanner />}
      {pendingDraft && mode === "launcher" && (
        <RestoreDraft onRestore={handleRestoreDraft} onDiscard={handleDiscardDraft} />
      )}
      {mode === "launcher" && <Launcher />}
      {mode === "editor" && <Editor />}
      {mode === "settings" && <Settings />}
    </div>
  );
}
