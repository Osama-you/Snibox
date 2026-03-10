import { useEditorStore } from "@/stores/editorStore";

export function ContentArea() {
  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const showEmptyContentHint = content.trim().length === 0;

  return (
    <div className="space-y-[4px] flex-1 flex flex-col">
      <label className="text-snippet-meta text-text-secondary">
        Content
      </label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste or type your snippet..."
        className="flex-1 min-h-[180px] px-md py-sm text-editor-content text-text-primary font-mono
                   bg-surface border border-border rounded-input outline-none
                   transition-colors resize-none
                   focus:border-accent focus:ring-1 focus:ring-accent/20
                   placeholder:text-text-subtle"
        spellCheck={false}
      />
      {showEmptyContentHint && (
        <p className="text-[10px] text-text-subtle">
          Hint: If content is empty, Snibox will paste the title.
        </p>
      )}
    </div>
  );
}
