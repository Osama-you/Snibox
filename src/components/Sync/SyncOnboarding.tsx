interface SyncOnboardingProps {
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export function SyncOnboarding({ onOpenSettings, onDismiss }: SyncOnboardingProps) {
  return (
    <div className="mx-md mb-xs px-sm py-[7px] rounded-input border border-border bg-surface/70 flex items-center justify-between gap-sm">
      <div className="min-w-0">
        <p className="text-snippet-body text-text-primary font-medium leading-tight">
          Connect Google Drive for trusted multi-device sync
        </p>
        <p className="text-snippet-meta text-text-secondary mt-[1px] leading-tight truncate">
          Local-first, offline queue, and explicit conflict review.
        </p>
      </div>
      <div className="flex items-center gap-xs flex-shrink-0">
        <button
          onClick={onOpenSettings}
          className="h-[24px] px-sm rounded-chip border border-accent/20 bg-accent/10 text-snippet-meta font-semibold text-accent hover:bg-accent/15 transition-colors"
        >
          Set up
        </button>
        <button
          onClick={onDismiss}
          className="h-[24px] px-sm rounded-chip text-snippet-meta text-text-subtle hover:text-text-secondary hover:bg-border/40 transition-colors"
        >
          Later
        </button>
      </div>
    </div>
  );
}
