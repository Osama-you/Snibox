import { useEditorStore } from "@/stores/editorStore";

export function TitleInput() {
  const title = useEditorStore((s) => s.title);
  const setTitle = useEditorStore((s) => s.setTitle);

  return (
    <div className="space-y-[4px]">
      <label className="text-snippet-meta text-text-secondary">
        Title
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled snippet..."
        className="w-full h-[36px] px-md text-editor-title text-text-primary bg-surface border border-border
                   rounded-input outline-none transition-colors
                   focus:border-accent focus:ring-1 focus:ring-accent/20
                   placeholder:text-text-subtle"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
