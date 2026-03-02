import { useEffect, useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useEditorStore } from "@/stores/editorStore";
import { commands, type Draft } from "@/lib/commands";
import { WINDOW } from "@/styles/tokens";
import { Launcher } from "@/components/Launcher/Launcher";
import { Editor } from "@/components/Editor/Editor";
import { RestoreDraft } from "@/components/Shared/RestoreDraft";
import { UpdateBanner } from "@/components/Shared/UpdateBanner";

export default function App() {
  const mode = useSnippetStore((s) => s.mode);
  const openEditor = useSnippetStore((s) => s.openEditor);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const closeOnBlur = useSettingsStore((s) => s.closeOnBlur);
  const initEditor = useEditorStore((s) => s.initEditor);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);

  useEffect(() => {
    loadSettings();
    commands.appReady();

    commands.getDraft().then((draft) => {
      if (draft && (draft.title || draft.content)) {
        setPendingDraft(draft);
      }
    });
  }, [loadSettings]);

  useEffect(() => {
    const height = mode === "editor" ? WINDOW.editorHeight : WINDOW.launcherHeight;
    commands.setWindowSize(WINDOW.launcherWidth, height);
  }, [mode]);

  useEffect(() => {
    const unlisten = listen("window-shown", () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        'input[placeholder="Search snippets..."]',
      );
      searchInput?.focus();
      searchInput?.select();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
      {mode === "launcher" ? <Launcher /> : <Editor />}
    </div>
  );
}
