import { useEffect, useState, useCallback } from "react";
import { useVaultStore } from "@/stores/vaultStore";
import { useDriveStore } from "@/stores/driveStore";
import { useSnippetStore } from "@/stores/snippetStore";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { Toast } from "../Shared/Toast";

interface ToastState {
  message: string;
  type: "success" | "error";
}

export function Settings() {
  const vaultFolder = useVaultStore((s) => s.vaultFolder);
  const syncStatus = useVaultStore((s) => s.syncStatus);
  const conflictCount = useVaultStore((s) => s.conflictCount);
  const enabled = useVaultStore((s) => s.enabled);
  const loadVaultStatus = useVaultStore((s) => s.loadVaultStatus);
  const setVaultFolder = useVaultStore((s) => s.setVaultFolder);
  const clearVaultFolder = useVaultStore((s) => s.clearVaultFolder);
  const exportToVault = useVaultStore((s) => s.exportToVault);
  const syncVault = useVaultStore((s) => s.syncVault);
  const closeSettings = useSnippetStore((s) => s.closeEditor);
  const refreshSnippets = useSnippetStore((s) => s.refreshSnippets);

  const driveConnected = useDriveStore((s) => s.connected);
  const driveStorageMode = useDriveStore((s) => s.storageMode);
  const driveSyncStatus = useDriveStore((s) => s.syncStatus);
  const driveConflictCount = useDriveStore((s) => s.conflictCount);
  const loadDriveStatus = useDriveStore((s) => s.loadDriveStatus);
  const startDriveAuth = useDriveStore((s) => s.startAuth);
  const completeDriveAuth = useDriveStore((s) => s.completeAuth);
  const disconnectDrive = useDriveStore((s) => s.disconnect);
  const syncDrive = useDriveStore((s) => s.sync);

  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [driveMode, setDriveMode] = useState<"appdata" | "folder">("appdata");

  useEffect(() => {
    loadVaultStatus();
    loadDriveStatus();
  }, [loadVaultStatus, loadDriveStatus]);

  useEffect(() => {
    const unlisten = listen<string>("drive-oauth-callback", async (event) => {
      try {
        setIsLoading(true);
        await completeDriveAuth(event.payload);
        await refreshSnippets();
        setToast({ message: "Google Drive connected and syncing", type: "success" });
      } catch (err) {
        setToast({ message: `Drive auth error: ${err}`, type: "error" });
      } finally {
        setIsLoading(false);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [completeDriveAuth, refreshSnippets]);

  const handleSelectFolder = useCallback(async () => {
    try {
      setIsLoading(true);
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Vault Folder",
      });

      if (selected && typeof selected === "string") {
        const stats = await setVaultFolder(selected);
        await refreshSnippets();
        setToast({
          message: `Vault synced: ${stats.imported} imported, ${stats.exported} exported, ${stats.updated} updated`,
          type: "success",
        });
      }
    } catch (err) {
      setToast({
        message: `Error: ${err}`,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [setVaultFolder, refreshSnippets]);

  const handleDisable = useCallback(async () => {
    try {
      setIsLoading(true);
      await clearVaultFolder();
      setToast({
        message: "Vault sync disabled",
        type: "success",
      });
    } catch (err) {
      setToast({
        message: `Error: ${err}`,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [clearVaultFolder]);

  const handleExport = useCallback(async () => {
    try {
      setIsLoading(true);
      const count = await exportToVault();
      setToast({
        message: `${count} snippets exported to vault`,
        type: "success",
      });
    } catch (err) {
      setToast({
        message: `Error: ${err}`,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [exportToVault]);

  const handleSync = useCallback(async () => {
    try {
      setIsLoading(true);
      await syncVault();
      await refreshSnippets();
      setToast({
        message: "Vault synced successfully",
        type: "success",
      });
    } catch (err) {
      setToast({
        message: `Error: ${err}`,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [syncVault, refreshSnippets]);

  const handleDriveConnect = useCallback(async () => {
    try {
      setIsLoading(true);
      const authUrl = await startDriveAuth(driveMode);
      await openUrl(authUrl);
    } catch (err) {
      setToast({ message: `Drive connect error: ${err}`, type: "error" });
      setIsLoading(false);
    }
  }, [startDriveAuth, driveMode]);

  const handleDriveDisconnect = useCallback(async () => {
    try {
      setIsLoading(true);
      await disconnectDrive();
      setToast({ message: "Google Drive disconnected", type: "success" });
    } catch (err) {
      setToast({ message: `Error: ${err}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [disconnectDrive]);

  const handleDriveSync = useCallback(async () => {
    try {
      setIsLoading(true);
      await syncDrive();
      await refreshSnippets();
      setToast({ message: "Drive sync triggered", type: "success" });
    } catch (err) {
      setToast({ message: `Error: ${err}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [syncDrive, refreshSnippets]);

  const handleBack = useCallback(() => {
    closeSettings();
  }, [closeSettings]);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="flex items-center justify-between px-base py-sm border-b border-border">
        <button
          onClick={handleBack}
          className="text-snippet-meta text-text-secondary hover:text-text-primary 
                     transition-colors duration-75"
        >
          ← Back
        </button>
        <h1 className="text-snippet-title font-semibold text-text-primary">Settings</h1>
        <div className="w-[60px]"></div>
      </div>

      <div className="flex-1 overflow-y-auto px-lg py-lg">
        <section className="mb-xl">
          <h2 className="text-snippet-title font-semibold text-text-primary mb-md">
            Vault Sync
          </h2>
          
          <div className="bg-bg-secondary rounded-md p-base border border-border">
            <div className="mb-base">
              <label className="block text-snippet-body text-text-secondary mb-sm">
                Vault Folder
              </label>
              <div className="flex items-center gap-sm">
                <div className="flex-1 px-sm py-xs rounded bg-bg-primary border border-border text-snippet-body text-text-primary truncate">
                  {vaultFolder || "Not configured"}
                </div>
                <button
                  onClick={handleSelectFolder}
                  disabled={isLoading}
                  className="px-base py-xs bg-accent text-white rounded 
                             hover:bg-accent-hover disabled:opacity-50 
                             transition-colors duration-75 text-snippet-body font-medium"
                >
                  {enabled ? "Change" : "Select"}
                </button>
              </div>
            </div>

            <div className="mb-base">
              <label className="block text-snippet-body text-text-secondary mb-sm">
                Status
              </label>
              <div className="flex items-center gap-sm">
                <div className={`w-2 h-2 rounded-full ${
                  syncStatus === "idle" ? "bg-green-500" :
                  syncStatus === "syncing" ? "bg-yellow-500" :
                  syncStatus === "conflicts" ? "bg-red-500" :
                  "bg-gray-400"
                }`} />
                <span className="text-snippet-body text-text-primary">
                  {syncStatus === "idle" ? "Synced" :
                   syncStatus === "syncing" ? "Syncing…" :
                   syncStatus === "conflicts" ? `${conflictCount} conflict(s) found` :
                   "Disabled"}
                </span>
              </div>
            </div>

            {enabled && (
              <div className="flex gap-sm">
                <button
                  onClick={handleSync}
                  disabled={isLoading}
                  className="px-base py-xs bg-bg-primary border border-border text-text-primary 
                             rounded hover:bg-bg-hover disabled:opacity-50 
                             transition-colors duration-75 text-snippet-body"
                >
                  Sync Now
                </button>
                <button
                  onClick={handleExport}
                  disabled={isLoading}
                  className="px-base py-xs bg-bg-primary border border-border text-text-primary 
                             rounded hover:bg-bg-hover disabled:opacity-50 
                             transition-colors duration-75 text-snippet-body"
                >
                  Export All
                </button>
                <button
                  onClick={handleDisable}
                  disabled={isLoading}
                  className="px-base py-xs bg-bg-primary border border-red-500 text-red-500 
                             rounded hover:bg-red-50 disabled:opacity-50 
                             transition-colors duration-75 text-snippet-body"
                >
                  Disable
                </button>
              </div>
            )}
          </div>

          <p className="mt-sm text-snippet-meta text-text-tertiary">
            Sync your snippets with a folder that can be backed up via Dropbox, iCloud, or any cloud service.
          </p>
        </section>

        <section className="mb-xl">
          <h2 className="text-snippet-title font-semibold text-text-primary mb-md">
            Google Drive Sync
          </h2>

          <div className="bg-bg-secondary rounded-md p-base border border-border">
            {!driveConnected ? (
              <>
                <div className="mb-base">
                  <label className="block text-snippet-body text-text-secondary mb-sm">
                    Storage Mode
                  </label>
                  <div className="flex gap-sm">
                    <button
                      onClick={() => setDriveMode("appdata")}
                      className={`flex-1 px-base py-xs rounded border text-snippet-body transition-colors duration-75 ${
                        driveMode === "appdata"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-bg-primary text-text-primary hover:bg-bg-hover"
                      }`}
                    >
                      Private (App Data)
                    </button>
                    <button
                      onClick={() => setDriveMode("folder")}
                      className={`flex-1 px-base py-xs rounded border text-snippet-body transition-colors duration-75 ${
                        driveMode === "folder"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-bg-primary text-text-primary hover:bg-bg-hover"
                      }`}
                    >
                      Drive Folder
                    </button>
                  </div>
                  <p className="mt-xs text-snippet-meta text-text-tertiary">
                    {driveMode === "appdata"
                      ? "Hidden app storage. Not visible in My Drive."
                      : "Creates a \"Snibox\" folder visible in your Drive."}
                  </p>
                </div>
                <button
                  onClick={handleDriveConnect}
                  disabled={isLoading}
                  className="w-full px-base py-xs bg-accent text-white rounded 
                             hover:bg-accent-hover disabled:opacity-50 
                             transition-colors duration-75 text-snippet-body font-medium"
                >
                  Connect Google Drive
                </button>
              </>
            ) : (
              <>
                <div className="mb-base">
                  <label className="block text-snippet-body text-text-secondary mb-sm">
                    Status
                  </label>
                  <div className="flex items-center gap-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      driveSyncStatus === "idle" ? "bg-green-500" :
                      driveSyncStatus === "syncing" ? "bg-blue-500" :
                      driveSyncStatus === "offline" ? "bg-yellow-500" :
                      driveSyncStatus === "auth_needed" ? "bg-red-500" :
                      driveSyncStatus === "error" ? "bg-red-500" :
                      "bg-gray-400"
                    }`} />
                    <span className="text-snippet-body text-text-primary">
                      {driveSyncStatus === "idle" ? "Synced" :
                       driveSyncStatus === "syncing" ? "Syncing..." :
                       driveSyncStatus === "offline" ? "Offline (queued)" :
                       driveSyncStatus === "auth_needed" ? "Re-auth needed" :
                       driveSyncStatus === "error" ? "Error" :
                       "Disconnected"}
                    </span>
                  </div>
                </div>

                <div className="mb-base">
                  <label className="block text-snippet-body text-text-secondary mb-sm">
                    Mode
                  </label>
                  <span className="text-snippet-body text-text-primary">
                    {driveStorageMode === "appdata" ? "Private (App Data)" : "Drive Folder"}
                  </span>
                </div>

                {driveConflictCount > 0 && (
                  <div className="mb-base px-sm py-xs bg-red-50 border border-red-200 rounded text-snippet-body text-red-700">
                    {driveConflictCount} conflict(s) found
                  </div>
                )}

                <div className="flex gap-sm">
                  <button
                    onClick={handleDriveSync}
                    disabled={isLoading}
                    className="px-base py-xs bg-bg-primary border border-border text-text-primary 
                               rounded hover:bg-bg-hover disabled:opacity-50 
                               transition-colors duration-75 text-snippet-body"
                  >
                    Sync Now
                  </button>
                  <button
                    onClick={handleDriveDisconnect}
                    disabled={isLoading}
                    className="px-base py-xs bg-bg-primary border border-red-500 text-red-500 
                               rounded hover:bg-red-50 disabled:opacity-50 
                               transition-colors duration-75 text-snippet-body"
                  >
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>

          <p className="mt-sm text-snippet-meta text-text-tertiary">
            Sync snippets directly to Google Drive. Works across devices.
          </p>
        </section>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
