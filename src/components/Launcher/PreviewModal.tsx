import { useId, useRef } from "react";
import type { SnippetWithTags } from "@/lib/commands";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface PreviewModalProps {
  snippet: SnippetWithTags;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
  onOpenConflict: () => void;
}

export function PreviewModal({
  snippet,
  onClose,
  onEdit,
  onCopy,
  onPaste,
  onDuplicate,
  onTogglePin,
  onOpenConflict,
}: PreviewModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef);

  return (
    <div
      ref={backdropRef}
      onClick={(event) => {
        if (event.target === backdropRef.current) onClose();
      }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/60 backdrop-blur-[1px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="bg-bg w-[calc(100%-32px)] max-h-[calc(100%-48px)] rounded-modal shadow-window flex flex-col overflow-hidden animate-scale-in"
      >
        <div className="flex items-center justify-between px-base pt-base pb-sm">
          <div className="min-w-0">
            <h2 id={titleId} className="text-editor-title text-text-primary truncate">
              {snippet.title || "Untitled"}
            </h2>
            <p className="text-snippet-meta text-text-subtle">
              {snippet.sync_state === "conflicted" ? "Conflict needs review" : "Ready to copy or edit"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-1 text-text-subtle hover:text-text-primary transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-base pb-sm flex flex-wrap gap-xs">
          {snippet.tags.map((tag) => (
            <span
              key={tag}
              className="text-snippet-meta text-text-subtle bg-tag-bg px-sm py-[2px] rounded-chip"
            >
              #{tag}
            </span>
          ))}
          {snippet.sync_state === "conflicted" && (
            <span className="text-snippet-meta text-danger bg-danger/10 px-sm py-[2px] rounded-chip">
              conflict
            </span>
          )}
        </div>

        <div className="px-base py-sm border-y border-border/70 bg-surface/45">
          <div className="flex flex-wrap gap-sm">
            <ActionButton label="Copy" onClick={onCopy} />
            <ActionButton label="Paste" onClick={onPaste} />
            <ActionButton label="Edit" onClick={onEdit} />
            <ActionButton label="Duplicate" onClick={onDuplicate} />
            <ActionButton label={snippet.pinned ? "Unpin" : "Pin"} onClick={onTogglePin} />
            {snippet.sync_state === "conflicted" && (
              <ActionButton label="Open conflict" onClick={onOpenConflict} />
            )}
          </div>
        </div>

        <div className="app-scrollbar flex-1 px-base py-base">
          <pre className="text-editor-content text-text-primary font-mono whitespace-pre-wrap break-words select-text">
            {snippet.content}
          </pre>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 transition-colors text-snippet-body"
    >
      {label}
    </button>
  );
}
