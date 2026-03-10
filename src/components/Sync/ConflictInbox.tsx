import { useId, useMemo, useRef } from "react";
import type { ResolveConflictPayload, SyncConflict } from "@/lib/commands";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { ConflictCard } from "./ConflictCard";

interface ConflictInboxProps {
  conflicts: SyncConflict[];
  onClose: () => void;
  onResolve: (conflictId: string, resolution: ResolveConflictPayload) => Promise<void>;
}

export function ConflictInbox({ conflicts, onClose, onResolve }: ConflictInboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef);

  const openConflicts = useMemo(
    () => conflicts.filter((c) => c.status === "open"),
    [conflicts],
  );

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/25 dark:bg-black/65 backdrop-blur-[1px] px-base"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="w-full max-w-[860px] max-h-[calc(100%-48px)] overflow-hidden rounded-modal bg-bg border border-border shadow-window flex flex-col"
      >
        <div className="flex items-center justify-between px-base py-sm border-b border-border">
          <div>
            <h2 id={titleId} className="text-editor-title text-text-primary">Conflict inbox</h2>
            <p className="text-snippet-body text-text-secondary">
              Review local and remote versions before the next sync.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-snippet-meta text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>

        <div className="app-scrollbar flex-1 p-base space-y-base">
          {openConflicts.length === 0 ? (
            <div className="text-center py-lg text-text-secondary">
              No open conflicts.
            </div>
          ) : (
            openConflicts.map((conflict) => (
              <ConflictCard key={conflict.id} conflict={conflict} onResolve={onResolve} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
