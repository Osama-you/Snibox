import { create } from "zustand";
import { commands } from "@/lib/commands";

type Theme = "light" | "dark" | "auto";

type WritableSettingKey =
  | "closeOnBlur"
  | "closeAfterCopy"
  | "windowPositionMode"
  | "globalHotkey"
  | "autoCheckUpdates"
  | "theme"
  | "accentPalette"
  | "syncOnboardingDismissed";

const BOOL_SETTING_KEYS: ReadonlySet<WritableSettingKey> = new Set([
  "closeOnBlur",
  "closeAfterCopy",
  "autoCheckUpdates",
  "syncOnboardingDismissed",
]);

const SETTING_KEY_MAP: Record<string, WritableSettingKey> = {
  close_on_blur_launcher: "closeOnBlur",
  close_after_copy: "closeAfterCopy",
  window_position_mode: "windowPositionMode",
  global_hotkey: "globalHotkey",
  auto_check_updates: "autoCheckUpdates",
  theme: "theme",
  accent_palette: "accentPalette",
  sync_onboarding_dismissed: "syncOnboardingDismissed",
};

interface SettingsStore {
  closeOnBlur: boolean;
  closeAfterCopy: boolean;
  windowPositionMode: "center" | "near_cursor";
  globalHotkey: string;
  autoCheckUpdates: boolean;
  theme: Theme;
  accentPalette: string;
  syncOnboardingDismissed: boolean;
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
  theme: "auto",
  accentPalette: "ocean",
  syncOnboardingDismissed: false,
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
      theme: (settings.theme as Theme) || "auto",
      accentPalette: settings.accent_palette || "ocean",
      syncOnboardingDismissed: settings.sync_onboarding_dismissed === "true",
      loaded: true,
    });
  },

  setSetting: async (key: string, value: string) => {
    await commands.setSetting(key, value);
    const storeKey = SETTING_KEY_MAP[key];
    if (!storeKey) return;
    const parsed: string | boolean = BOOL_SETTING_KEYS.has(storeKey) ? value === "true" : value;
    set((state) => ({ ...state, [storeKey]: parsed }));
  },
}));
