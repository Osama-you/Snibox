import { useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { commands } from "@/lib/commands";
import { WINDOW } from "@/styles/tokens";
import { Launcher } from "@/components/Launcher/Launcher";
import { Editor } from "@/components/Editor/Editor";

export default function App() {
  const mode = useSnippetStore((s) => s.mode);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const closeOnBlur = useSettingsStore((s) => s.closeOnBlur);

  useEffect(() => {
    loadSettings();
    commands.appReady();
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

  return (
    <div className="window-container">
      {mode === "launcher" ? <Launcher /> : <Editor />}
    </div>
  );
}
