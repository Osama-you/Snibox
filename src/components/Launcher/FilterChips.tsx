import { memo } from "react";

interface FilterChipsProps {
  filters: string[];
  onClear: (filter: string) => void;
}

export const FilterChips = memo(function FilterChips({ filters, onClear }: FilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <div className="px-md pb-xs flex items-center gap-xs flex-wrap">
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => onClear(filter)}
          aria-label={`Remove filter: ${filter}`}
          className="inline-flex items-center gap-[6px] h-[24px] px-sm
                     text-snippet-meta text-accent bg-accent/10 border border-accent/20 rounded-chip
                     hover:bg-accent/15 transition-colors"
        >
          <span>{filter}</span>
          <span aria-hidden="true">&times;</span>
        </button>
      ))}
    </div>
  );
});
