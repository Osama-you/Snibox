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
    <div className="flex items-center justify-between pt-md">
      <button
        onClick={onCancel}
        className="h-[36px] px-base text-snippet-title text-text-secondary
                   bg-surface border border-border rounded-btn
                   hover:bg-border transition-colors duration-75
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        Cancel
      </button>
      <div className="flex items-center gap-sm">
        <span className="text-snippet-meta text-text-subtle">
          {saveLabel}
        </span>
        <button
          onClick={onSave}
          className="h-[36px] px-base text-snippet-title text-white
                     bg-accent hover:bg-accent-hover rounded-btn
                     transition-colors duration-75
                     focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
        >
          Save
        </button>
      </div>
    </div>
  );
}
