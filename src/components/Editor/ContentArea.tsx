import { useEditorStore } from "@/stores/editorStore";

export function ContentArea() {
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);

  return (
    <div className="space-y-xs flex-1 flex flex-col">
      <label className="text-snippet-meta text-text-secondary font-medium">
        Content
      </label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste or type your snippet..."
        className="flex-1 min-h-[200px] px-md py-md text-editor-content font-mono
                   bg-surface border border-border rounded-input outline-none
                   transition-colors duration-75 resize-none
                   focus:border-accent focus:ring-2 focus:ring-accent/20
                   placeholder:text-text-subtle"
        spellCheck={false}
      />
    </div>
  );
}
