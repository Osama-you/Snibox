import { create } from "zustand";
import type {
  ResolveConflictPayload,
  SyncActivityItem,
  SyncConflict,
  SyncStatus,
} from "@/lib/commands";
import { commands } from "@/lib/commands";

interface SyncStore {
  status: SyncStatus | null;
  conflicts: SyncConflict[];
  activity: SyncActivityItem[];
  loading: boolean;
  pendingAuth: {
    redirectPort: number;
    codeVerifier: string;
    storageMode: "appdata" | "folder";
  } | null;

  loadStatus: () => Promise<void>;
  loadConflicts: () => Promise<void>;
  loadActivity: () => Promise<void>;
  refresh: () => Promise<void>;
  startAuth: (storageMode: "appdata" | "folder") => Promise<string>;
  completeAuth: (callbackUrl: string) => Promise<void>;
  disconnect: () => Promise<void>;
  retrySync: () => Promise<void>;
  resolveConflict: (conflictId: string, resolution: ResolveConflictPayload) => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  setTransientStatus: (syncStatus: SyncStatus["syncStatus"]) => void;
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

function buildDiagnostics(status: SyncStatus | null, conflicts: SyncConflict[], activity: SyncActivityItem[]): string {
  return [
    "Snibox diagnostics",
    `provider: ${status?.provider ?? "unknown"}`,
    `connected: ${status?.connected ?? false}`,
    `syncStatus: ${status?.syncStatus ?? "unknown"}`,
    `lastSynced: ${status?.lastSynced ?? "never"}`,
    `queueDepth: ${status?.queueDepth ?? 0}`,
    `conflictCount: ${status?.conflictCount ?? 0}`,
    `needsReauth: ${status?.needsReauth ?? false}`,
    `lastError: ${status?.lastError ?? "none"}`,
    "",
    "Open conflicts:",
    ...(conflicts.length > 0
      ? conflicts.map((conflict) => `- ${conflict.snippetId}: ${conflict.reason}`)
      : ["- none"]),
    "",
    "Recent activity:",
    ...(activity.length > 0
      ? activity.map((item) => `- [${item.level}] ${item.action}: ${item.message}`)
      : ["- none"]),
  ].join("\n");
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: null,
  conflicts: [],
  activity: [],
  loading: false,
  pendingAuth: null,

  loadStatus: async () => {
    const status = await commands.getSyncStatus();
    set({ status });
  },

  loadConflicts: async () => {
    const conflicts = await commands.listSyncConflicts();
    set({ conflicts });
  },

  loadActivity: async () => {
    const activity = await commands.listSyncActivity(10);
    set({ activity });
  },

  refresh: async () => {
    set({ loading: true });
    try {
      const [status, conflicts, activity] = await Promise.all([
        commands.getSyncStatus(),
        commands.listSyncConflicts(),
        commands.listSyncActivity(10),
      ]);
      set({ status, conflicts, activity, loading: false });
    } catch {
      set({ loading: false });
      throw new Error("Failed to refresh sync state");
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
    if (!pendingAuth) throw new Error("No pending auth session");

    const code = extractCodeFromCallback(callbackUrl);
    if (!code) throw new Error("No auth code found in callback");

    await commands.driveCompleteAuth(
      code,
      pendingAuth.redirectPort,
      pendingAuth.codeVerifier,
      pendingAuth.storageMode,
    );

    set({ pendingAuth: null });
    await get().refresh();
  },

  disconnect: async () => {
    await commands.driveDisconnect();
    await get().refresh();
  },

  retrySync: async () => {
    await commands.retrySync();
    set((state) => ({
      status: state.status ? { ...state.status, syncStatus: "syncing" } : state.status,
    }));
  },

  resolveConflict: async (conflictId, resolution) => {
    await commands.resolveSyncConflict(conflictId, resolution);
    await get().refresh();
  },

  copyDiagnostics: async () => {
    const { status, conflicts, activity } = get();
    await commands.copyText(buildDiagnostics(status, conflicts, activity));
  },

  setTransientStatus: (syncStatus) =>
    set((state) => ({
      status: state.status ? { ...state.status, syncStatus } : state.status,
    })),
}));
