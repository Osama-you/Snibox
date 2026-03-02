import type { SnippetWithTags } from "@/lib/commands";
import { truncatePreview, highlightMatches } from "@/lib/search";
import { useSnippetStore } from "@/stores/snippetStore";

interface SnippetRowProps {
  snippet: SnippetWithTags;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

export function SnippetRow({ snippet, index, isSelected, onClick }: SnippetRowProps) {
  const searchQuery = useSnippetStore((s) => s.searchQuery);
  const title = snippet.title || "Untitled";
  const preview = truncatePreview(snippet.content);
  const titleParts = highlightMatches(title, searchQuery);
  const previewParts = highlightMatches(preview, searchQuery);

  return (
    <button
      data-index={index}
      onClick={onClick}
      className={`w-full h-[56px] px-md flex items-center gap-sm text-left
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
    </button>
  );
}
