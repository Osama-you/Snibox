import { type SyncStatus } from "@/lib/commands";
import { ShortcutHints } from "./ShortcutHints";
import { SyncCenter } from "../Sync/SyncCenter";

interface LauncherFooterProps {
  syncStatus: SyncStatus | null;
  onRetry: () => void;
  onOpenConflicts: () => void;
  onCopyDiagnostics: () => void;
  onOpenSettings: () => void;
}

export function LauncherFooter({
  syncStatus,
  onRetry,
  onOpenConflicts,
  onCopyDiagnostics,
  onOpenSettings,
}: LauncherFooterProps) {
  return (
    <div className="h-[64px] flex-shrink-0 border-t border-border px-md py-sm grid grid-cols-[minmax(150px,1fr)_auto_28px] items-center gap-sm">
      <div className="min-w-0">
        <SyncCenter
          compact
          status={syncStatus}
          onRetry={onRetry}
          onOpenConflicts={onOpenConflicts}
          onCopyDiagnostics={onCopyDiagnostics}
        />
      </div>
      <div className="flex items-center justify-center min-w-0">
        <ShortcutHints />
      </div>
      <div className="flex items-center justify-end">
        <button
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="text-text-subtle hover:text-text-primary transition-colors p-0.5"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
            <path
              fillRule="evenodd"
              d="M9.796 1.503a.5.5 0 00-.593 0l-1.518 1.106a6.963 6.963 0 00-1.354.516l-1.78-.264a.5.5 0 00-.536.283L3.32 4.605a.5.5 0 00.104.58l1.26 1.26c-.071.425-.11.862-.11 1.306 0 .444.039.881.11 1.306l-1.26 1.26a.5.5 0 00-.104.58l.695 1.462a.5.5 0 00.536.283l1.78-.264c.416.215.873.388 1.354.516l1.518 1.106a.5.5 0 00.593 0l1.518-1.106c.481-.128.938-.301 1.354-.516l1.78.264a.5.5 0 00.536-.283l.695-1.462a.5.5 0 00-.104-.58l-1.26-1.26c.071-.425.11-.862.11-1.306 0-.444-.039-.881-.11-1.306l1.26-1.26a.5.5 0 00.104-.58l-.695-1.462a.5.5 0 00-.536-.283l-1.78.264a6.963 6.963 0 00-1.354-.516L9.796 1.503zM8 11a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
