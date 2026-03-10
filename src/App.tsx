import { useEffect, useCallback, useState } from "react";

type DriveSyncStatus = "idle" | "syncing" | "error" | "auth_needed" | "offline" | "conflicted";
import { listen } from "@tauri-apps/api/event";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKeybindStore } from "@/stores/keybindStore";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useSyncStore } from "@/stores/syncStore";
import { commands, type Draft } from "@/lib/commands";
import { WINDOW } from "@/styles/tokens";
import { getPalette } from "@/lib/palettes";
import { Launcher } from "@/components/Launcher/Launcher";
import { Editor } from "@/components/Editor/Editor";
import { Settings } from "@/components/Settings/Settings";
import { RestoreDraft } from "@/components/Shared/RestoreDraft";
import { UpdateBanner } from "@/components/Shared/UpdateBanner";

function usePalette() {
  const accentPalette = useSettingsStore((s) => s.accentPalette);
  // `theme` is included so this effect re-runs after useTheme() has toggled the
  // "dark" class on <html>, ensuring isDark is read at the right time.
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const palette = getPalette(accentPalette);
    const root = document.documentElement;
    const c1 = isDark ? palette.c1Dark : palette.c1;
    const c2 = isDark ? palette.c2Dark : palette.c2;
    root.style.setProperty("--color-accent", c1);
    root.style.setProperty("--color-accent-2", c2);
    // accent-hover: slightly lighter variant of c1 (bump lightness by 8)
    const parts = c1.split(" ");
    const l = parseFloat(parts[2]);
    root.style.setProperty("--color-accent-hover", `${parts[0]} ${parts[1]} ${Math.min(l + 8, 90)}%`);
  }, [accentPalette, theme]);
}

function useTheme() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = (resolved: "light" | "dark") => {
      root.classList.toggle("dark", resolved === "dark");
    };

    if (theme === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mq.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);
}

export default function App() {
  const mode = useSnippetStore((s) => s.mode);
  const openEditor = useSnippetStore((s) => s.openEditor);
  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadKeybinds = useKeybindStore((s) => s.loadKeybinds);
  const closeOnBlur = useSettingsStore((s) => s.closeOnBlur);
  const initEditor = useEditorStore((s) => s.initEditor);
  const loadVaultStatus = useVaultStore((s) => s.loadVaultStatus);
  const refreshSyncState = useSyncStore((s) => s.refresh);
  const setTransientSyncStatus = useSyncStore((s) => s.setTransientStatus);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);

  useTheme();
  usePalette();

  useEffect(() => {
    loadSettings();
    loadKeybinds();
    loadVaultStatus();
    void refreshSyncState();
    commands.appReady();

    commands.getDraft().then((draft) => {
      if (draft && (draft.title || draft.content)) {
        setPendingDraft(draft);
      }
    });
  }, [loadSettings, loadKeybinds, loadVaultStatus, refreshSyncState]);

  useEffect(() => {
    const height = WINDOW.launcherHeight;
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

    const unlistenDriveStatus = listen<DriveSyncStatus>("drive-sync-status", async (event) => {
      const nextStatus = event.payload;
      setTransientSyncStatus(nextStatus);
      if (nextStatus !== "syncing") {
        await refreshSyncState();
      }
      if (nextStatus === "idle") {
        await refreshSnippets();
      }
    });

    const unlistenDriveAuth = listen("drive-auth-needed", () => {
      setTransientSyncStatus("auth_needed");
    });

    return () => {
      unlistenWindowShown.then((fn) => fn());
      unlistenVaultChanged.then((fn) => fn());
      unlistenDriveStatus.then((fn) => fn());
      unlistenDriveAuth.then((fn) => fn());
    };
  }, [refreshSnippets, refreshSyncState, setTransientSyncStatus]);

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
      <div
        data-tauri-drag-region
        className="drag-region h-[28px] flex-shrink-0 flex items-center justify-center"
      >
        <div className="flex gap-[3px] opacity-30">
          <span className="w-[3px] h-[3px] rounded-full bg-text-subtle" />
          <span className="w-[3px] h-[3px] rounded-full bg-text-subtle" />
          <span className="w-[3px] h-[3px] rounded-full bg-text-subtle" />
        </div>
      </div>
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
