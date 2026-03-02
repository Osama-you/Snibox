import { useEditorStore } from "@/stores/editorStore";

export function TitleInput() {
  const title = useEditorStore((s) => s.title);
  const setTitle = useEditorStore((s) => s.setTitle);

  return (
    <div className="space-y-xs">
      <label className="text-snippet-meta text-text-secondary font-medium">
        Title
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled snippet..."
        className="w-full h-[40px] px-md text-editor-title bg-surface border border-border
                   rounded-input outline-none transition-colors duration-75
                   focus:border-accent focus:ring-2 focus:ring-accent/20
                   placeholder:text-text-subtle"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
