interface FilterChipsProps {
  activeTag: string | null;
  onClear: () => void;
}

export function FilterChips({ activeTag, onClear }: FilterChipsProps) {
  if (!activeTag) return null;

  return (
    <div className="px-md pb-xs flex items-center gap-xs">
      <span className="inline-flex items-center gap-[2px] h-[24px] px-sm
                        text-snippet-meta text-accent bg-accent/10 border border-accent/20 rounded-chip">
        #{activeTag}
      </span>
      <button
        onClick={onClear}
        className="h-[24px] px-sm text-snippet-meta text-text-subtle
                   hover:text-danger transition-colors duration-75 rounded-chip
                   hover:bg-danger/10"
      >
        &times; clear
      </button>
    </div>
  );
}
