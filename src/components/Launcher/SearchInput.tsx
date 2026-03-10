import { useEffect, useRef } from "react";
import { useSnippetStore } from "@/stores/snippetStore";

export function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useSnippetStore((s) => s.searchQuery);
  const setQuery = useSnippetStore((s) => s.setQuery);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleShown = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("focus", handleShown);
    return () => window.removeEventListener("focus", handleShown);
  }, []);

  return (
    <div className="px-md pb-sm">
      <div className="relative">
        <svg
          className="absolute left-[10px] top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
          width="14" height="14" viewBox="0 0 16 16" fill="currentColor"
        >
          <path fillRule="evenodd" d="M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z" clipRule="evenodd" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search snippets..."
          aria-label="Search snippets"
          className="w-full h-[36px] pl-[32px] pr-md text-search-input bg-surface border border-border
                     rounded-input outline-none transition-colors
                     focus:border-accent/60 focus:ring-1 focus:ring-accent/10
                     placeholder:text-text-subtle"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
