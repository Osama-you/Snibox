import { platform } from "@/lib/platform";

interface EmptyStateProps {
  hasSnippets: boolean;
  searchQuery: string;
}

export function EmptyState({ hasSnippets, searchQuery }: EmptyStateProps) {
  if (!hasSnippets && !searchQuery) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-base py-lg">
        <p className="text-snippet-title text-text-secondary mb-sm">
          No snippets yet.
        </p>
        <p className="text-snippet-body text-text-subtle">
          Press{" "}
          <kbd className="px-xs py-[1px] bg-surface border border-border rounded text-snippet-meta font-mono">
            {platform.modKey}+N
          </kbd>{" "}
          to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-base py-lg">
      <p className="text-snippet-title text-text-secondary mb-sm">
        No matches for &ldquo;{searchQuery}&rdquo;
      </p>
      <p className="text-snippet-body text-text-subtle">
        Try <code className="text-accent">#tag</code> or{" "}
        <code className="text-accent">tag:name</code>
      </p>
    </div>
  );
}
