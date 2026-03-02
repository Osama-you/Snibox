import { useEffect } from "react";
import { useUpdaterStore } from "@/stores/updaterStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function UpdateBanner() {
  const status = useUpdaterStore((s) => s.status);
  const version = useUpdaterStore((s) => s.version);
  const progress = useUpdaterStore((s) => s.progress);
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate);
  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);
  const restartApp = useUpdaterStore((s) => s.restartApp);
  const dismiss = useUpdaterStore((s) => s.dismiss);
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates);
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (loaded && autoCheckUpdates) {
      checkForUpdate();
    }
  }, [loaded, autoCheckUpdates, checkForUpdate]);

  if (status === "idle" || status === "checking") return null;

  if (status === "error") return null;

  return (
    <div className="mx-md mt-sm px-md py-sm bg-accent/10 border border-accent/20 rounded-input
                    flex items-center justify-between animate-slide-up">
      {status === "available" && (
        <>
          <span className="text-snippet-body text-text-primary">
            Snibox <strong>v{version}</strong> available.
          </span>
          <div className="flex items-center gap-sm">
            <button
              onClick={downloadAndInstall}
              className="text-snippet-meta font-semibold text-accent hover:text-accent-hover
                         transition-colors duration-75"
            >
              Update now
            </button>
            <button
              onClick={dismiss}
              className="text-snippet-meta text-text-subtle hover:text-text-secondary
                         transition-colors duration-75"
            >
              Later
            </button>
          </div>
        </>
      )}

      {status === "downloading" && (
        <>
          <span className="text-snippet-body text-text-primary">
            Downloading update...
          </span>
          <div className="flex items-center gap-sm">
            <div className="w-[100px] h-[4px] bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-snippet-meta text-text-secondary">{progress}%</span>
          </div>
        </>
      )}

      {status === "ready" && (
        <>
          <span className="text-snippet-body text-text-primary">
            Update ready.
          </span>
          <div className="flex items-center gap-sm">
            <button
              onClick={restartApp}
              className="text-snippet-meta font-semibold text-accent hover:text-accent-hover
                         transition-colors duration-75"
            >
              Restart now
            </button>
            <button
              onClick={dismiss}
              className="text-snippet-meta text-text-subtle hover:text-text-secondary
                         transition-colors duration-75"
            >
              Later
            </button>
          </div>
        </>
      )}
    </div>
  );
}
