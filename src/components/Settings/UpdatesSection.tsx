import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUpdaterStore } from "@/stores/updaterStore";

export function UpdatesSection() {
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const updaterStatus = useUpdaterStore((s) => s.status);
  const updaterVersion = useUpdaterStore((s) => s.version);
  const updaterNotes = useUpdaterStore((s) => s.notes);
  const updaterProgress = useUpdaterStore((s) => s.progress);
  const updaterError = useUpdaterStore((s) => s.error);
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate);
  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);
  const restartApp = useUpdaterStore((s) => s.restartApp);
  const dismissUpdate = useUpdaterStore((s) => s.dismiss);

  const [manualUpdateMessage, setManualUpdateMessage] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then((v) => setCurrentVersion(v))
      .catch(() => setCurrentVersion(null));
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setManualUpdateMessage(null);
    const result = await checkForUpdate();
    if (result === "none") setManualUpdateMessage("You are already on the latest version.");
    if (result === "error") setManualUpdateMessage("Update check failed. See details below.");
  }, [checkForUpdate]);

  const handleDownloadAndInstall = useCallback(async () => {
    await downloadAndInstall();
  }, [downloadAndInstall]);

  const handleRestartForUpdate = useCallback(async () => {
    await restartApp();
  }, [restartApp]);

  return (
    <section className="space-y-base">
      <div className="bg-surface rounded-input p-md border border-border space-y-md">
        <div className="flex items-center justify-between gap-sm">
          <div>
            <h2 className="text-snippet-title text-text-primary">App updates</h2>
            <p className="text-snippet-body text-text-secondary mt-xs">
              Installed users can update in place without reinstalling.
            </p>
            {currentVersion && (
              <p className="text-snippet-meta text-text-subtle mt-[4px]">
                Current version: v{currentVersion}
              </p>
            )}
          </div>
          <button
            onClick={() => void handleCheckForUpdates()}
            disabled={updaterStatus === "checking" || updaterStatus === "downloading"}
            className="px-md py-[5px] bg-accent text-white rounded-btn hover:bg-accent-hover disabled:opacity-50 transition-colors text-snippet-body font-medium"
          >
            {updaterStatus === "checking" ? "Checking..." : "Check now"}
          </button>
        </div>

        <div>
          <label className="block text-snippet-meta text-text-secondary mb-[4px]">
            Automatic checks
          </label>
          <div className="flex gap-sm">
            <button
              onClick={() => void setSetting("auto_check_updates", "true")}
              aria-pressed={autoCheckUpdates}
              className={`flex-1 px-md py-[5px] rounded-btn border text-snippet-body transition-colors ${
                autoCheckUpdates
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-bg text-text-primary hover:bg-border/40"
              }`}
            >
              Enabled
            </button>
            <button
              onClick={() => void setSetting("auto_check_updates", "false")}
              aria-pressed={!autoCheckUpdates}
              className={`flex-1 px-md py-[5px] rounded-btn border text-snippet-body transition-colors ${
                !autoCheckUpdates
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-bg text-text-primary hover:bg-border/40"
              }`}
            >
              Disabled
            </button>
          </div>
        </div>

        {manualUpdateMessage && (
          <p className="text-snippet-body text-text-secondary">{manualUpdateMessage}</p>
        )}

        {updaterStatus === "available" && (
          <div className="rounded-btn border border-accent/30 bg-accent/10 p-sm space-y-sm">
            <p className="text-snippet-body text-text-primary">
              Snibox <strong>v{updaterVersion}</strong> is available.
            </p>
            {updaterNotes && (
              <p className="text-snippet-meta text-text-secondary whitespace-pre-wrap">{updaterNotes}</p>
            )}
            <div className="flex gap-sm">
              <button
                onClick={() => void handleDownloadAndInstall()}
                className="px-md py-[5px] bg-accent text-white rounded-btn hover:bg-accent-hover transition-colors text-snippet-body font-medium"
              >
                Download and install
              </button>
              <button
                onClick={dismissUpdate}
                className="px-md py-[5px] bg-bg border border-border text-text-primary rounded-btn hover:bg-border/40 transition-colors text-snippet-body"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {updaterStatus === "downloading" && (
          <div className="rounded-btn border border-border bg-bg p-sm space-y-xs">
            <p className="text-snippet-body text-text-primary">
              Downloading update ({updaterProgress}%)
            </p>
            <div className="w-full h-[6px] bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${updaterProgress}%` }}
              />
            </div>
          </div>
        )}

        {updaterStatus === "ready" && (
          <div className="rounded-btn border border-accent/30 bg-accent/10 p-sm flex items-center justify-between gap-sm">
            <p className="text-snippet-body text-text-primary">Update installed. Restart to finish.</p>
            <button
              onClick={() => void handleRestartForUpdate()}
              className="px-md py-[5px] bg-accent text-white rounded-btn hover:bg-accent-hover transition-colors text-snippet-body font-medium"
            >
              Restart now
            </button>
          </div>
        )}

        {updaterStatus === "error" && (
          <div className="rounded-btn border border-danger/40 bg-danger/10 p-sm space-y-xs">
            <p className="text-snippet-body text-danger">
              {updaterError || "Updater failed. Please try again."}
            </p>
            <button
              onClick={() => void handleCheckForUpdates()}
              className="px-md py-[5px] bg-bg border border-danger/40 text-danger rounded-btn hover:bg-danger/10 transition-colors text-snippet-body"
            >
              Retry check
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
