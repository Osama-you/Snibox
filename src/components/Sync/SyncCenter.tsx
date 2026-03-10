import type { SyncStatus } from "@/lib/commands";

interface SyncCenterProps {
  status: SyncStatus | null;
  compact?: boolean;
  onRetry?: () => void;
  onOpenConflicts?: () => void;
  onCopyDiagnostics?: () => void;
}

function formatLastSynced(raw: string | null | undefined): string {
  if (!raw) return "Never";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "Never";

  const now = new Date();
  const sameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  if (sameDay) {
    return `Today ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed)}`;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function statusLabel(status: SyncStatus | null): string {
  if (!status) return "Sync unavailable";
  switch (status.syncStatus) {
    case "syncing":
      return "Syncing changes";
    case "offline":
      return "Offline, queueing changes";
    case "auth_needed":
      return "Reconnect Google Drive";
    case "error":
      return status.lastError ? `Sync error: ${status.lastError}` : "Sync error";
    case "conflicted":
      return "Conflicts need review";
    default:
      if (!status.connected) return "Google Drive not connected";
      return status.queueDepth > 0 ? `${status.queueDepth} change(s) queued` : "Everything synced";
  }
}

function compactStatusLabel(status: SyncStatus | null): string {
  if (!status) return "Unavailable";
  switch (status.syncStatus) {
    case "syncing":
      return "Syncing";
    case "offline":
      return status.queueDepth > 0 ? `Offline (${status.queueDepth} queued)` : "Offline";
    case "auth_needed":
      return "Auth needed";
    case "error":
      return "Error";
    case "conflicted":
      return `Conflicts (${status.conflictCount})`;
    default:
      if (!status.connected) return "Not connected";
      return status.queueDepth > 0 ? `Queued (${status.queueDepth})` : "Synced";
  }
}

function statusTone(status: SyncStatus | null): string {
  if (!status) return "bg-text-subtle";
  switch (status.syncStatus) {
    case "syncing":
      return "bg-status-busy";
    case "offline":
      return "bg-status-warn";
    case "auth_needed":
    case "error":
    case "conflicted":
      return "bg-status-error";
    default:
      return status.connected ? "bg-status-ok" : "bg-text-subtle";
  }
}

export function SyncCenter({
  status,
  compact = false,
  onRetry,
  onOpenConflicts,
  onCopyDiagnostics,
}: SyncCenterProps) {
  const hasConflicts = (status?.conflictCount ?? 0) > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-sm min-w-0">
        <span className={`w-[6px] h-[6px] rounded-full ${statusTone(status)}`} />
        <div className="min-w-0 leading-tight">
          <p className="text-snippet-meta text-text-secondary uppercase tracking-wide">
            Sync
          </p>
          <p className="text-snippet-body text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">
            {compactStatusLabel(status)}
          </p>
        </div>
        {hasConflicts && (
          <button
            onClick={onOpenConflicts}
            className="text-snippet-meta text-danger hover:text-danger transition-colors whitespace-nowrap"
          >
            {status?.conflictCount} conflict{status?.conflictCount === 1 ? "" : "s"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-input p-md border border-border space-y-md">
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <div className="flex items-center gap-sm">
            <span className={`w-[8px] h-[8px] rounded-full ${statusTone(status)}`} />
            <h3 className="text-snippet-title text-text-primary">
              Google Drive sync
            </h3>
          </div>
          <p className="text-snippet-body text-text-secondary mt-xs">
            {statusLabel(status)}
          </p>
          <div className="text-[10px] text-text-subtle mt-xs leading-snug">
            <p title={status?.lastSynced ?? ""}>Last synced: {formatLastSynced(status?.lastSynced)}</p>
            <p>Queue: {status?.queueDepth ?? 0}</p>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 transition-colors text-snippet-body whitespace-nowrap"
            >
              Retry
            </button>
          )}
          {/* {onCopyDiagnostics && (
            <button
              onClick={onCopyDiagnostics}
              className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 transition-colors text-snippet-body whitespace-nowrap"
            >
              Copy diagnostics
            </button>
          )} */}
        </div>
      </div>

      {status?.lastError && (
        <div className="px-sm py-[6px] bg-danger/10 border border-danger/20 rounded text-snippet-body text-danger">
          {status.lastError}
        </div>
      )}

      <div className="flex items-center justify-between gap-sm">
        <p className="text-snippet-body text-text-secondary">
          {hasConflicts
            ? `${status?.conflictCount} conflict${status?.conflictCount === 1 ? "" : "s"} waiting for review`
            : "No open conflicts"}
        </p>
        {hasConflicts && onOpenConflicts && (
          <button
            onClick={onOpenConflicts}
            className="text-snippet-meta font-semibold text-accent hover:text-accent-hover transition-colors whitespace-nowrap"
          >
            Open conflict inbox
          </button>
        )}
      </div>
    </div>
  );
}
