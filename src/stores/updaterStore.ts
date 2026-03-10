import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";
type UpdateCheckResult = "available" | "none" | "error";

interface UpdaterStore {
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
  update: Update | null;

  checkForUpdate: () => Promise<UpdateCheckResult>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  status: "idle",
  version: null,
  notes: null,
  progress: 0,
  error: null,
  update: null,

  checkForUpdate: async () => {
    set({ status: "checking", error: null });
    try {
      const update = await check();
      if (update) {
        set({
          status: "available",
          version: update.version,
          notes: update.body ?? null,
          update,
        });
        return "available";
      } else {
        set({ status: "idle", update: null, version: null, notes: null, progress: 0, error: null });
        return "none";
      }
    } catch (e) {
      set({ status: "error", error: String(e), update: null });
      return "error";
    }
  },

  downloadAndInstall: async () => {
    const { update } = get();
    if (!update) return;
    set({ status: "downloading", progress: 0 });
    try {
      let totalLength = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalLength = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            set({ progress: Math.round((downloaded / totalLength) * 100) });
          }
        } else if (event.event === "Finished") {
          set({ status: "ready", progress: 100 });
        }
      });
      set({ status: "ready", progress: 100 });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  restartApp: async () => {
    await relaunch();
  },

  dismiss: () => {
    set({ status: "idle", update: null, version: null, notes: null, progress: 0 });
  },
}));
