import { create } from "zustand";
import { commands } from "@/lib/commands";

type SyncStatus = "idle" | "syncing" | "error" | "auth_needed" | "offline" | "disconnected";

interface DriveStore {
  connected: boolean;
  storageMode: "appdata" | "folder" | null;
  syncStatus: SyncStatus;
  lastSynced: string | null;
  conflictCount: number;

  pendingAuth: {
    redirectPort: number;
    codeVerifier: string;
    storageMode: string;
  } | null;

  loadDriveStatus: () => Promise<void>;
  startAuth: (storageMode: "appdata" | "folder") => Promise<string>;
  completeAuth: (callbackUrl: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sync: () => Promise<void>;
  setSyncStatus: (status: SyncStatus) => void;
}

function extractCodeFromCallback(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("code");
  } catch {
    const match = url.match(/[?&]code=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

export const useDriveStore = create<DriveStore>((set, get) => ({
  connected: false,
  storageMode: null,
  syncStatus: "disconnected",
  lastSynced: null,
  conflictCount: 0,
  pendingAuth: null,

  loadDriveStatus: async () => {
    try {
      const status = await commands.driveGetStatus();
      set({
        connected: status.connected,
        storageMode: (status.storageMode as "appdata" | "folder") ?? null,
        syncStatus: (status.syncStatus as SyncStatus) ?? "disconnected",
        lastSynced: status.lastSynced,
        conflictCount: status.conflictCount,
      });
    } catch {
      set({ connected: false, syncStatus: "disconnected" });
    }
  },

  startAuth: async (storageMode) => {
    const result = await commands.driveStartAuth();
    set({
      pendingAuth: {
        redirectPort: result.redirectPort,
        codeVerifier: result.codeVerifier,
        storageMode,
      },
    });
    return result.authUrl;
  },

  completeAuth: async (callbackUrl) => {
    const { pendingAuth } = get();
    if (!pendingAuth) throw new Error("No pending auth");

    const code = extractCodeFromCallback(callbackUrl);
    if (!code) throw new Error("No auth code in callback");

    await commands.driveCompleteAuth(
      code,
      pendingAuth.redirectPort,
      pendingAuth.codeVerifier,
      pendingAuth.storageMode,
    );

    set({
      connected: true,
      storageMode: pendingAuth.storageMode as "appdata" | "folder",
      syncStatus: "syncing",
      pendingAuth: null,
    });
  },

  disconnect: async () => {
    await commands.driveDisconnect();
    set({
      connected: false,
      storageMode: null,
      syncStatus: "disconnected",
      lastSynced: null,
      conflictCount: 0,
      pendingAuth: null,
    });
  },

  sync: async () => {
    set({ syncStatus: "syncing" });
    await commands.driveSync();
  },

  setSyncStatus: (status) => set({ syncStatus: status }),
}));
