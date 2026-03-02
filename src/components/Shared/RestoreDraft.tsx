interface RestoreDraftProps {
  onRestore: () => void;
  onDiscard: () => void;
}

export function RestoreDraft({ onRestore, onDiscard }: RestoreDraftProps) {
  return (
    <div className="mx-md mt-sm px-md py-sm bg-surface border border-border rounded-input
                    flex items-center justify-between animate-slide-up">
      <span className="text-snippet-body text-text-secondary">
        Unsaved draft found.
      </span>
      <div className="flex items-center gap-sm">
        <button
          onClick={onRestore}
          className="text-snippet-meta font-semibold text-accent hover:text-accent-hover
                     transition-colors duration-75"
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          className="text-snippet-meta font-semibold text-text-subtle hover:text-danger
                     transition-colors duration-75"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
