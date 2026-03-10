import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useVaultStore } from "@/stores/vaultStore";
import { useSnippetStore } from "@/stores/snippetStore";
import { useSyncStore } from "@/stores/syncStore";
import { SyncCenter } from "../Sync/SyncCenter";
import { ConflictInbox } from "../Sync/ConflictInbox";
import { Toast } from "../Shared/Toast";

interface ToastState {
  message: string;
  type: "success" | "error";
}

export function SyncSection() {
  const vaultFolder = useVaultStore((s) => s.vaultFolder);
  const backupEnabled = useVaultStore((s) => s.enabled);
  const loadVaultStatus = useVaultStore((s) => s.loadVaultStatus);
  const setVaultFolder = useVaultStore((s) => s.setVaultFolder);
  const clearVaultFolder = useVaultStore((s) => s.clearVaultFolder);
  const exportBackup = useVaultStore((s) => s.exportToVault);
  const importBackup = useVaultStore((s) => s.syncVault);

  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);

  const syncStatus = useSyncStore((s) => s.status);
  const syncConflicts = useSyncStore((s) => s.conflicts);
  const syncActivity = useSyncStore((s) => s.activity);
  const refreshSync = useSyncStore((s) => s.refresh);
  const startAuth = useSyncStore((s) => s.startAuth);
  const completeAuth = useSyncStore((s) => s.completeAuth);
  const disconnect = useSyncStore((s) => s.disconnect);
  const retrySync = useSyncStore((s) => s.retrySync);
  const resolveConflict = useSyncStore((s) => s.resolveConflict);
  const copyDiagnostics = useSyncStore((s) => s.copyDiagnostics);

  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [driveMode, setDriveMode] = useState<"appdata" | "folder">("appdata");
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    void loadVaultStatus();
    void refreshSync();
  }, [loadVaultStatus, refreshSync]);

  useEffect(() => {
    const unlisten = listen<string>("drive-oauth-callback", async (event) => {
      try {
        setIsLoading(true);
        await completeAuth(event.payload);
        await refreshSnippets();
        setToast({ message: "Google Drive connected and syncing", type: "success" });
      } catch (error) {
        setToast({ message: `Drive auth error: ${error}`, type: "error" });
      } finally {
        setIsLoading(false);
      }
    });
    return () => { unlisten.then((dispose) => dispose()); };
  }, [completeAuth, refreshSnippets]);

  const handleSelectFolder = useCallback(async () => {
    try {
      setIsLoading(true);
      const selected = await open({ directory: true, multiple: false, title: "Select Backup Folder" });
      if (selected && typeof selected === "string") {
        const stats = await setVaultFolder(selected);
        await refreshSnippets();
        setToast({
          message: `Backup synced: ${stats.imported} imported, ${stats.exported} exported, ${stats.updated} updated`,
          type: "success",
        });
      }
    } catch (error) {
      setToast({ message: `Backup folder error: ${error}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [refreshSnippets, setVaultFolder]);

  const handleDisableBackup = useCallback(async () => {
    try {
      setIsLoading(true);
      await clearVaultFolder();
      setToast({ message: "Backup folder disconnected", type: "success" });
    } catch (error) {
      setToast({ message: `Disable backup error: ${error}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [clearVaultFolder]);

  const handleExportBackup = useCallback(async () => {
    try {
      setIsLoading(true);
      const count = await exportBackup();
      setToast({ message: `${count} snippets exported to backup`, type: "success" });
    } catch (error) {
      setToast({ message: `Export backup error: ${error}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [exportBackup]);

  const handleImportBackup = useCallback(async () => {
    try {
      setIsLoading(true);
      await importBackup();
      await refreshSnippets();
      setToast({ message: "Backup imported successfully", type: "success" });
    } catch (error) {
      setToast({ message: `Import backup error: ${error}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [importBackup, refreshSnippets]);

  const handleDriveConnect = useCallback(async () => {
    try {
      setIsLoading(true);
      const authUrl = await startAuth(driveMode);
      await openUrl(authUrl);
    } catch (error) {
      setToast({ message: `Drive connect error: ${error}`, type: "error" });
      setIsLoading(false);
    }
  }, [driveMode, startAuth]);

  const handleDriveDisconnect = useCallback(async () => {
    try {
      setIsLoading(true);
      await disconnect();
      setToast({ message: "Google Drive disconnected", type: "success" });
    } catch (error) {
      setToast({ message: `Drive disconnect error: ${error}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [disconnect]);

  const handleRetry = useCallback(async () => {
    try {
      setIsLoading(true);
      await retrySync();
      setToast({ message: "Sync retry queued", type: "success" });
    } catch (error) {
      setToast({ message: `Retry error: ${error}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [retrySync]);

  return (
    <div className="space-y-base">
      <SyncCenter
        status={syncStatus}
        onRetry={() => void handleRetry()}
        onOpenConflicts={() => setShowConflicts(true)}
        onCopyDiagnostics={() =>
          void copyDiagnostics().then(() =>
            setToast({ message: "Diagnostics copied", type: "success" }),
          )
        }
      />

      {!syncStatus?.connected && (
        <section className="bg-surface rounded-input p-md border border-border space-y-md">
          <div>
            <h2 className="text-snippet-title text-text-primary">Set up trusted sync</h2>
            <p className="text-snippet-body text-text-secondary mt-xs">
              Google Drive is the primary multi-device path. Snibox stays local-first, queues
              changes when offline, and opens conflicts for review instead of silently overwriting data.
            </p>
          </div>

          <div>
            <label className="block text-snippet-meta text-text-secondary mb-[4px]">Storage mode</label>
            <div className="flex gap-sm">
              <button
                onClick={() => setDriveMode("appdata")}
                className={`flex-1 px-md py-[5px] rounded-btn border text-snippet-body transition-colors ${
                  driveMode === "appdata"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-bg text-text-primary hover:bg-border/40"
                }`}
              >
                Private app data
              </button>
              <button
                onClick={() => setDriveMode("folder")}
                className={`flex-1 px-md py-[5px] rounded-btn border text-snippet-body transition-colors ${
                  driveMode === "folder"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-bg text-text-primary hover:bg-border/40"
                }`}
              >
                Drive folder
              </button>
            </div>
          </div>

          <button
            onClick={() => void handleDriveConnect()}
            disabled={isLoading}
            className="w-full px-md py-[5px] bg-accent text-white rounded-btn hover:bg-accent-hover disabled:opacity-50 transition-colors text-snippet-body font-medium"
          >
            Connect Google Drive
          </button>
        </section>
      )}

      {syncStatus?.connected && (
        <section className="bg-surface rounded-input p-md border border-border space-y-md">
          <div className="flex items-center justify-between gap-sm">
            <div>
              <h2 className="text-snippet-title text-text-primary">Connected provider</h2>
              <p className="text-snippet-body text-text-secondary mt-xs">
                Google Drive is active. Reconnect if auth expires, or retry when there are queued changes.
              </p>
            </div>
            <button
              onClick={() => void handleDriveDisconnect()}
              disabled={isLoading}
              className="px-md py-[5px] bg-bg border border-danger/40 text-danger rounded-btn hover:bg-danger/10 disabled:opacity-50 transition-colors text-snippet-body whitespace-nowrap"
            >
              Disconnect
            </button>
          </div>

          <div className="space-y-xs">
            {syncActivity.slice(0, 5).map((item) => (
              <div key={item.id} className="text-snippet-body text-text-secondary">
                <span className="text-text-subtle mr-xs">[{item.level}]</span>
                {item.message}
              </div>
            ))}
            {syncActivity.length === 0 && (
              <p className="text-snippet-body text-text-subtle">No sync activity yet.</p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-md">
        <h2 className="text-snippet-meta text-text-secondary uppercase tracking-wide">
          Backup &amp; portability
        </h2>
        <div className="bg-surface rounded-input p-md border border-border space-y-md">
          <div>
            <label className="block text-snippet-meta text-text-secondary mb-[4px]">Backup folder</label>
            <div className="flex items-center gap-sm">
              <div className="flex-1 px-sm py-[5px] rounded bg-bg border border-border text-snippet-body text-text-primary truncate">
                {vaultFolder || "Not configured"}
              </div>
              <button
                onClick={() => void handleSelectFolder()}
                disabled={isLoading}
                className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 disabled:opacity-50 transition-colors text-snippet-body"
              >
                {backupEnabled ? "Change" : "Select"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-sm">
            <button
              onClick={() => void handleExportBackup()}
              disabled={!backupEnabled || isLoading}
              className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 disabled:opacity-50 transition-colors text-snippet-body"
            >
              Export backup
            </button>
            <button
              onClick={() => void handleImportBackup()}
              disabled={!backupEnabled || isLoading}
              className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 disabled:opacity-50 transition-colors text-snippet-body"
            >
              Import backup
            </button>
            {backupEnabled && (
              <button
                onClick={() => void handleDisableBackup()}
                disabled={isLoading}
                className="px-md py-[5px] bg-bg border border-danger/40 text-danger rounded-btn hover:bg-danger/10 disabled:opacity-50 transition-colors text-snippet-body"
              >
                Disable backup
              </button>
            )}
          </div>

          <p className="text-[10px] text-text-subtle">
            Use a local folder for export/import, manual backup, or cloud-drive mirroring. This is
            secondary to the primary Google Drive sync path.
          </p>
        </div>
      </section>

      {showConflicts && (
        <ConflictInbox
          conflicts={syncConflicts}
          onClose={() => setShowConflicts(false)}
          onResolve={async (conflictId, resolution) => {
            await resolveConflict(conflictId, resolution);
            await refreshSnippets();
            setToast({ message: "Conflict resolved", type: "success" });
          }}
        />
      )}

      {toast && (
        <Toast message={toast.message} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
