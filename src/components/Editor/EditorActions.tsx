import { platform } from "@/lib/platform";

interface EditorActionsProps {
  onSave: () => void;
  onCancel: () => void;
}

export function EditorActions({ onSave, onCancel }: EditorActionsProps) {
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
          {platform.modKey}+Enter
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
