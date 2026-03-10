import { platform } from "@/lib/platform";
import { useKeybindStore } from "@/stores/keybindStore";

interface EditorActionsProps {
  onSave: () => void;
  onCancel: () => void;
}

export function EditorActions({ onSave, onCancel }: EditorActionsProps) {
  const saveBind = useKeybindStore((s) => s.editorBinds.save);
  const saveLabel = platform.formatShortcut(
    saveBind.key === "Enter" ? "Enter" : saveBind.key.toUpperCase(),
    !!saveBind.mod,
    !!saveBind.shift,
  );

  return (
    <div className="flex items-center justify-between pt-sm">
      <button
        onClick={onCancel}
        className="h-[32px] px-base text-snippet-body text-text-secondary
                   bg-surface border border-border rounded-btn
                   hover:bg-border/60 transition-colors"
      >
        Cancel
      </button>
      <div className="flex items-center gap-sm">
        <span className="text-[10px] text-text-subtle font-mono">
          {saveLabel}
        </span>
        <button
          onClick={onSave}
          className="h-[32px] px-base text-snippet-body font-medium text-white
                     bg-accent hover:bg-accent-hover rounded-btn
                     transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
