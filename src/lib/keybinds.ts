import { useEffect } from "react";
import { platform } from "./platform";

export interface KeybindDef {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

export const DEFAULT_LAUNCHER_BINDS: Record<string, KeybindDef> = {
  new: { key: "n", mod: true },
  moveUp: { key: "ArrowUp" },
  moveDown: { key: "ArrowDown" },
  copy: { key: "Enter" },
  pin: { key: "p", mod: true },
  edit: { key: "e", mod: true },
  delete: { key: "Delete" },
  close: { key: "Escape" },
};

export const DEFAULT_EDITOR_BINDS: Record<string, KeybindDef> = {
  save: { key: "Enter", mod: true },
  cancel: { key: "Escape" },
};

function matchesKeybind(e: KeyboardEvent, def: KeybindDef): boolean {
  if (e.key !== def.key) return false;
  const modPressed = platform.isMac ? e.metaKey : e.ctrlKey;
  if (def.mod && !modPressed) return false;
  if (!def.mod && modPressed) return false;
  if (def.shift && !e.shiftKey) return false;
  if (!def.shift && e.shiftKey) return false;
  return true;
}

export function useKeybind(
  binds: Record<string, KeybindDef>,
  handlers: Record<string, () => void>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      for (const [id, def] of Object.entries(binds)) {
        if (handlers[id] && matchesKeybind(e, def)) {
          e.preventDefault();
          e.stopPropagation();
          handlers[id]();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [binds, handlers, enabled]);
}
