import { create } from "zustand";
import { commands } from "@/lib/commands";

interface SettingsStore {
  closeOnBlur: boolean;
  closeAfterCopy: boolean;
  windowPositionMode: "center" | "near_cursor";
  globalHotkey: string;
  autoCheckUpdates: boolean;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  setSetting: (key: string, value: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  closeOnBlur: true,
  closeAfterCopy: true,
  windowPositionMode: "center",
  globalHotkey: "CmdOrCtrl+Shift+Space",
  autoCheckUpdates: true,
  loaded: false,

  loadSettings: async () => {
    const settings = await commands.getSettings();
    set({
      closeOnBlur: settings.close_on_blur_launcher !== "false",
      closeAfterCopy: settings.close_after_copy !== "false",
      windowPositionMode:
        settings.window_position_mode === "near_cursor" ? "near_cursor" : "center",
      globalHotkey: settings.global_hotkey || "CmdOrCtrl+Shift+Space",
      autoCheckUpdates: settings.auto_check_updates !== "false",
      loaded: true,
    });
  },

  setSetting: async (key: string, value: string) => {
    await commands.setSetting(key, value);
    const keyMap: Record<string, string> = {
      close_on_blur_launcher: "closeOnBlur",
      close_after_copy: "closeAfterCopy",
      window_position_mode: "windowPositionMode",
      global_hotkey: "globalHotkey",
      auto_check_updates: "autoCheckUpdates",
    };
    const storeKey = keyMap[key];
    if (storeKey) {
      if (storeKey === "closeOnBlur" || storeKey === "closeAfterCopy" || storeKey === "autoCheckUpdates") {
        set({ [storeKey]: value !== "false" } as never);
      } else {
        set({ [storeKey]: value } as never);
      }
    }
  },
}));
