import type { ResolveConflictPayload, SyncConflict } from "@/lib/commands";
import { formatReason, formatTimestamp, getChangedFields } from "@/lib/conflictUtils";

interface ConflictCardProps {
  conflict: SyncConflict;
  onResolve: (conflictId: string, resolution: ResolveConflictPayload) => Promise<void>;
}

export function ConflictCard({ conflict, onResolve }: ConflictCardProps) {
  const changedFields = getChangedFields(conflict);
  const contentChanged = changedFields.includes("content");

  return (
    <div className="border border-border rounded-input overflow-hidden bg-surface/55">
      <div className="px-base py-sm bg-surface border-b border-border space-y-[3px]">
        <p className="text-snippet-title text-text-primary">
          {conflict.localSnippet.title || conflict.remoteSnippet.title || "Untitled"}
        </p>
        <p className="text-snippet-meta text-text-secondary">
          {formatReason(conflict.reason)}
        </p>
        <p className="text-snippet-meta text-text-subtle">
          Changed: {changedFields.length > 0 ? changedFields.join(", ") : "unknown"} &mdash; Local{" "}
          {formatTimestamp(conflict.localSnippet.updated_at)} &mdash; Remote{" "}
          {formatTimestamp(conflict.remoteSnippet.updated_at)}
        </p>
        {!contentChanged && (
          <p className="text-snippet-meta text-text-subtle">
            Content is identical. This conflict is likely in title, tags, or pin state.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <section className="p-base border-b md:border-b-0 md:border-r border-border">
          <p className="text-snippet-meta text-text-secondary uppercase tracking-wide mb-sm">Local</p>
          <pre className="app-scrollbar max-h-[220px] text-snippet-body text-text-primary whitespace-pre-wrap break-words">
            {conflict.localSnippet.content || "(empty)"}
          </pre>
        </section>
        <section className="p-base">
          <p className="text-snippet-meta text-text-secondary uppercase tracking-wide mb-sm">Remote</p>
          <pre className="app-scrollbar max-h-[220px] text-snippet-body text-text-primary whitespace-pre-wrap break-words">
            {conflict.remoteSnippet.content || "(empty)"}
          </pre>
        </section>
      </div>

      <div className="px-base py-sm border-t border-border bg-surface">
        <div className="grid grid-cols-2 gap-sm md:flex md:flex-wrap">
          <button
            onClick={() => onResolve(conflict.id, { strategy: "keepLocal" })}
            className="px-md py-[5px] bg-accent text-white rounded-btn hover:bg-accent-hover transition-colors text-snippet-body"
          >
            Keep local
          </button>
          <button
            onClick={() => onResolve(conflict.id, { strategy: "keepRemote" })}
            className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 transition-colors text-snippet-body"
          >
            Keep remote
          </button>
          <button
            onClick={() => onResolve(conflict.id, { strategy: "duplicateBoth" })}
            className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 transition-colors text-snippet-body"
          >
            Duplicate both
          </button>
          <button
            onClick={() =>
              onResolve(conflict.id, {
                strategy: "mergeManual",
                title: conflict.localSnippet.title,
                content: `${conflict.localSnippet.content}\n\n--- REMOTE VERSION ---\n${conflict.remoteSnippet.content}`,
                tags: Array.from(
                  new Set([...conflict.localSnippet.tags, ...conflict.remoteSnippet.tags]),
                ),
              })
            }
            className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 transition-colors text-snippet-body"
          >
            Merge manually
          </button>
        </div>
      </div>
    </div>
  );
}
