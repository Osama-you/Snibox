import { create } from "zustand";
import { commands } from "@/lib/commands";
import {
  DEFAULT_LAUNCHER_BINDS,
  DEFAULT_EDITOR_BINDS,
  type KeybindDef,
} from "@/lib/keybinds";

type BindGroup = "launcher" | "editor";

function serializeDef(def: KeybindDef): string {
  return `${def.key},${!!def.mod},${!!def.shift}`;
}

function deserializeDef(raw: string): KeybindDef | null {
  const parts = raw.split(",");
  if (parts.length < 3) return null;
  return {
    key: parts[0],
    mod: parts[1] === "true",
    shift: parts[2] === "true",
  };
}

function settingsKey(group: BindGroup, action: string): string {
  return `keybind_${group}_${action}`;
}

interface KeybindStore {
  launcherBinds: Record<string, KeybindDef>;
  editorBinds: Record<string, KeybindDef>;
  loaded: boolean;

  loadKeybinds: () => Promise<void>;
  updateKeybind: (
    group: BindGroup,
    action: string,
    def: KeybindDef,
  ) => Promise<void>;
  resetKeybind: (group: BindGroup, action: string) => Promise<void>;
  resetAll: () => Promise<void>;
  isCustomized: (group: BindGroup, action: string) => boolean;
}

export const useKeybindStore = create<KeybindStore>((set, get) => ({
  launcherBinds: { ...DEFAULT_LAUNCHER_BINDS },
  editorBinds: { ...DEFAULT_EDITOR_BINDS },
  loaded: false,

  loadKeybinds: async () => {
    const settings = await commands.getSettings();
    const launcher = { ...DEFAULT_LAUNCHER_BINDS };
    const editor = { ...DEFAULT_EDITOR_BINDS };

    for (const [key, value] of Object.entries(settings)) {
      if (!key.startsWith("keybind_")) continue;
      const rest = key.slice("keybind_".length);
      const dotIdx = rest.indexOf("_");
      if (dotIdx === -1) continue;
      const group = rest.slice(0, dotIdx) as BindGroup;
      const action = rest.slice(dotIdx + 1);
      const def = deserializeDef(value);
      if (!def) continue;

      if (group === "launcher" && action in launcher) {
        launcher[action] = def;
      } else if (group === "editor" && action in editor) {
        editor[action] = def;
      }
    }

    set({ launcherBinds: launcher, editorBinds: editor, loaded: true });
  },

  updateKeybind: async (group, action, def) => {
    const key = settingsKey(group, action);
    await commands.setSetting(key, serializeDef(def));

    if (group === "launcher") {
      set((s) => ({
        launcherBinds: { ...s.launcherBinds, [action]: def },
      }));
    } else {
      set((s) => ({
        editorBinds: { ...s.editorBinds, [action]: def },
      }));
    }
  },

  resetKeybind: async (group, action) => {
    const key = settingsKey(group, action);
    const defaults =
      group === "launcher" ? DEFAULT_LAUNCHER_BINDS : DEFAULT_EDITOR_BINDS;
    const def = defaults[action];
    if (!def) return;

    await commands.setSetting(key, serializeDef(def));

    if (group === "launcher") {
      set((s) => ({
        launcherBinds: { ...s.launcherBinds, [action]: { ...def } },
      }));
    } else {
      set((s) => ({
        editorBinds: { ...s.editorBinds, [action]: { ...def } },
      }));
    }
  },

  resetAll: async () => {
    const { launcherBinds, editorBinds } = get();

    const promises: Promise<unknown>[] = [];
    for (const action of Object.keys(launcherBinds)) {
      const key = settingsKey("launcher", action);
      const def = DEFAULT_LAUNCHER_BINDS[action];
      if (def) promises.push(commands.setSetting(key, serializeDef(def)));
    }
    for (const action of Object.keys(editorBinds)) {
      const key = settingsKey("editor", action);
      const def = DEFAULT_EDITOR_BINDS[action];
      if (def) promises.push(commands.setSetting(key, serializeDef(def)));
    }
    await Promise.all(promises);

    set({
      launcherBinds: { ...DEFAULT_LAUNCHER_BINDS },
      editorBinds: { ...DEFAULT_EDITOR_BINDS },
    });
  },

  isCustomized: (group, action) => {
    const defaults =
      group === "launcher" ? DEFAULT_LAUNCHER_BINDS : DEFAULT_EDITOR_BINDS;
    const current =
      group === "launcher" ? get().launcherBinds : get().editorBinds;
    const def = defaults[action];
    const cur = current[action];
    if (!def || !cur) return false;
    return serializeDef(def) !== serializeDef(cur);
  },
}));
