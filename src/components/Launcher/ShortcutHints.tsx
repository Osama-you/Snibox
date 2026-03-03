import { platform } from "@/lib/platform";
import { useKeybindStore } from "@/stores/keybindStore";
import type { KeybindDef } from "@/lib/keybinds";

function formatDef(def: KeybindDef): string {
  const displayKey = def.key === "Escape" ? "Esc" : def.key === "Delete" ? "Del" : def.key.toUpperCase();
  return platform.formatShortcut(displayKey, !!def.mod, !!def.shift);
}

export function ShortcutHints() {
  const binds = useKeybindStore((s) => s.launcherBinds);

  return (
    <div className="h-[32px] flex items-center justify-center gap-base px-md border-t border-border">
      <Hint keys={formatDef(binds.new)} label="new" />
      <Hint keys={formatDef(binds.copy)} label="copy" />
      <Hint keys={formatDef(binds.edit)} label="edit" />
      <Hint keys={formatDef(binds.close)} label="close" />
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="text-snippet-meta text-text-subtle flex items-center gap-[3px]">
      <kbd className="font-mono text-text-secondary">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}
