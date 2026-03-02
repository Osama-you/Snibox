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
    <div className="px-md pt-base pb-sm">
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search snippets..."
        className="w-full h-[40px] px-md text-search-input bg-surface border border-border
                   rounded-input outline-none transition-colors duration-75
                   focus:border-accent focus:ring-2 focus:ring-accent/20
                   placeholder:text-text-subtle"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
