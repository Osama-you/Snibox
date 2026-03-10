import { useState, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";

export function TagsInput() {
  const tags = useEditorStore((s) => s.tags);
  const setTags = useEditorStore((s) => s.setTags);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setInputValue("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="space-y-[4px]">
      <label className="text-snippet-meta text-text-secondary">
        Tags
      </label>
      <div
        className="flex flex-wrap items-center gap-xs px-sm py-[5px] min-h-[32px]
                    bg-surface border border-border rounded-input cursor-text
                    focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-[2px] h-[22px] px-[6px]
                       text-snippet-meta text-text-secondary bg-tag-bg rounded-chip"
          >
            {tag}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="ml-[1px] text-text-subtle hover:text-danger transition-colors"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) addTag(inputValue);
          }}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          className="flex-1 min-w-[80px] h-[22px] bg-transparent outline-none text-text-primary
                     text-snippet-meta placeholder:text-text-subtle"
        />
      </div>
    </div>
  );
}
