import type { SnippetWithTags } from "@/lib/commands";
import { truncatePreview, highlightMatches } from "@/lib/search";
import { useSnippetStore } from "@/stores/snippetStore";

interface SnippetRowProps {
  snippet: SnippetWithTags;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function SnippetRow({ snippet, index, isSelected, onClick, onDelete }: SnippetRowProps) {
  const searchQuery = useSnippetStore((s) => s.searchQuery);
  const title = snippet.title || "Untitled";
  const preview = truncatePreview(snippet.content);
  const titleParts = highlightMatches(title, searchQuery);
  const previewParts = highlightMatches(preview, searchQuery);

  return (
    <div
      data-index={index}
      onClick={onClick}
      className={`group w-full h-[56px] px-md flex items-center gap-sm text-left
                  transition-colors duration-75 border-l-2 cursor-default
                  ${
                    isSelected
                      ? "bg-accent/[0.08] border-l-accent"
                      : "border-l-transparent hover:bg-surface"
                  }`}
    >
      {snippet.pinned && (
        <span className="w-[6px] h-[6px] rounded-full bg-pin flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="text-snippet-title text-text-primary truncate">
          {titleParts.map((part, i) =>
            part.highlighted ? (
              <mark key={i} className="bg-yellow-100 text-inherit rounded-sm px-[1px]">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </div>
        <div className="text-snippet-body text-text-secondary truncate">
          {previewParts.map((part, i) =>
            part.highlighted ? (
              <mark key={i} className="bg-yellow-100 text-inherit rounded-sm px-[1px]">
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
              className="text-snippet-meta text-text-subtle bg-tag-bg px-sm py-[2px] rounded-chip"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100
                   text-text-subtle hover:text-red-500 transition-opacity duration-75 p-1 -mr-1"
        title="Delete snippet"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
