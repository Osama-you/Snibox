import { memo } from "react";
import type { SnippetWithTags } from "@/lib/commands";
import { truncatePreview, highlightMatches } from "@/lib/search";
import { useSnippetStore } from "@/stores/snippetStore";

export interface SnippetRowProps {
  snippet: SnippetWithTags;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  hasHoverTarget: boolean;
  /** Called when the row is clicked or activated via keyboard. */
  onActivate: (index: number, snippetId: string) => void;
  onHover: (index: number) => void;
  onTogglePin: (snippetId: string) => void;
  onEdit: (snippetId: string) => void;
  onPreview: (snippet: SnippetWithTags) => void;
  onDelete: (snippetId: string) => void;
}

export const SnippetRow = memo(function SnippetRow({
  snippet,
  index,
  isSelected,
  isHovered,
  hasHoverTarget,
  onActivate,
  onHover,
  onTogglePin,
  onEdit,
  onPreview,
  onDelete,
}: SnippetRowProps) {
  const searchQuery = useSnippetStore((s) => s.searchQuery);
  const title = snippet.title || "Untitled";
  const preview = truncatePreview(snippet.content);
  const titleParts = highlightMatches(title, searchQuery);
  const previewParts = highlightMatches(preview, searchQuery);
  const isActive = isHovered || (isSelected && !hasHoverTarget);
  const isLastSelectedGhost = isSelected && hasHoverTarget && !isHovered;

  return (
    <div
      data-index={index}
      onClick={() => onActivate(index, snippet.id)}
      onMouseEnter={() => onHover(index)}
      className={`group w-full h-[50px] px-md flex items-center gap-sm text-left rounded-lg
                  transition-all duration-100 border cursor-default shrink-0
                  ${
                    isActive
                      ? "card-gradient-selected border-accent/25 shadow-[0_0_0_1px_hsl(var(--color-accent)/0.08),0_1px_4px_hsl(var(--color-accent)/0.08)]"
                      : isLastSelectedGhost
                        ? "bg-surface/85 border-border shadow-[inset_0_0_0_1px_hsl(var(--color-border)/0.75)]"
                      : "bg-bg/70 border-border/50 shadow-sm hover:bg-bg hover:border-border hover:shadow-md"
                  }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(snippet.id);
        }}
        aria-label={snippet.pinned ? "Unpin snippet" : "Pin snippet"}
        className={`group/pin w-[12px] h-[20px] -ml-[2px] flex items-center justify-center rounded-sm flex-shrink-0 transition-all ${
          snippet.pinned
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-70 group-focus-within:opacity-85"
        }`}
      >
        <span
          className={`w-[6px] h-[6px] rounded-full transition-colors ${
            snippet.pinned
              ? "bg-pin"
              : "bg-text-subtle group-hover/pin:bg-pin group-focus-visible/pin:bg-pin"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-xs min-w-0">
          <div className="text-snippet-title text-text-primary truncate leading-tight">
            {titleParts.map((part, i) =>
              part.highlighted ? (
                <mark key={i} className="bg-accent/15 text-inherit rounded-sm px-[1px]">
                  {part.text}
                </mark>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </div>
          {snippet.sync_state === "conflicted" && (
            <span className="text-[10px] px-[6px] py-[1px] rounded-chip bg-danger/10 text-danger flex-shrink-0">
              conflict
            </span>
          )}
        </div>
        <div className="text-snippet-body text-text-secondary truncate mt-[1px]">
          {previewParts.map((part, i) =>
            part.highlighted ? (
              <mark key={i} className="bg-accent/15 text-inherit rounded-sm px-[1px]">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </div>
      </div>

      {snippet.tags.length > 0 && (
        <div className="flex gap-xs flex-shrink-0">
          {snippet.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-snippet-meta text-text-subtle bg-tag-bg px-[6px] py-[1px] rounded-chip"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${
        isActive ? "opacity-90" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      }`}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPreview(snippet);
          }}
          aria-label="Preview snippet"
          className="text-text-subtle hover:text-accent transition-colors p-1"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 2c-2.837 0-5.34 1.476-7.407 4.4a1.07 1.07 0 000 1.2C2.66 10.524 5.163 12 8 12s5.34-1.476 7.407-4.4a1.07 1.07 0 000-1.2C13.34 3.476 10.837 2 8 2zm0 8.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
            <circle cx="8" cy="7" r="2" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(snippet.id);
          }}
          aria-label="Edit snippet"
          className="text-text-subtle hover:text-accent transition-colors p-1"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.464 11.098a.25.25 0 00-.064.108l-.631 2.208 2.208-.63a.25.25 0 00.108-.064l8.609-8.61a.25.25 0 000-.353l-1.086-1.086-.181.182.18-.182z" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(snippet.id);
          }}
          aria-label="Delete snippet"
          className="text-text-subtle hover:text-danger transition-colors p-1"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
});
