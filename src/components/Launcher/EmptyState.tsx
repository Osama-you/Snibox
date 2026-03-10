import { platform } from "@/lib/platform";
import { useKeybindStore } from "@/stores/keybindStore";

interface EmptyStateProps {
  hasSnippets: boolean;
  searchQuery: string;
}

export function EmptyState({ hasSnippets, searchQuery }: EmptyStateProps) {
  const newBind = useKeybindStore((s) => s.launcherBinds.new);
  const shortcutLabel = platform.formatShortcut(
    newBind.key.toUpperCase(),
    !!newBind.mod,
    !!newBind.shift,
  );

  if (!hasSnippets && !searchQuery) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-base py-lg">
        <p className="text-snippet-title text-text-secondary mb-xs">
          No snippets yet.
        </p>
        <p className="text-snippet-body text-text-subtle">
          Press{" "}
          <kbd className="px-[5px] py-[1px] bg-surface border border-border rounded text-[10px] font-mono text-text-secondary">
            {shortcutLabel}
          </kbd>{" "}
          to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-base py-lg">
      <p className="text-snippet-title text-text-secondary mb-xs">
        No matches for &ldquo;{searchQuery}&rdquo;
      </p>
      <p className="text-snippet-body text-text-subtle">
        Try <code className="text-accent">#tag</code> or{" "}
        <code className="text-accent">tag:name</code> or{" "}
        <code className="text-accent">is:pinned</code>
      </p>
    </div>
  );
}
