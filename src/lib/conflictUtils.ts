import type { SyncConflict } from "@/lib/commands";

const REASON_LABELS: Record<string, string> = {
  remote_changed_while_local_pending: "Local and remote changed at the same time",
  initial_sync_diverged: "Local and remote diverged during initial sync",
};

export function formatReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function getChangedFields(conflict: SyncConflict): string[] {
  const fields: string[] = [];
  if ((conflict.localSnippet.title ?? "") !== (conflict.remoteSnippet.title ?? "")) {
    fields.push("title");
  }
  if (conflict.localSnippet.content !== conflict.remoteSnippet.content) {
    fields.push("content");
  }
  if (conflict.localSnippet.pinned !== conflict.remoteSnippet.pinned) {
    fields.push("pin");
  }
  const localTags = [...conflict.localSnippet.tags].sort().join(",");
  const remoteTags = [...conflict.remoteSnippet.tags].sort().join(",");
  if (localTags !== remoteTags) {
    fields.push("tags");
  }
  return fields;
}
