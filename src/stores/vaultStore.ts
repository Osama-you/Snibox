import { create } from "zustand";
import type { SyncStats } from "@/lib/commands";
import { commands } from "@/lib/commands";

interface VaultStore {
  vaultFolder: string | null;
  syncStatus: "idle" | "syncing" | "conflicts" | "disabled";
  conflictCount: number;
  enabled: boolean;

  loadVaultStatus: () => Promise<void>;
  setVaultFolder: (path: string) => Promise<SyncStats>;
  clearVaultFolder: () => Promise<void>;
  exportToVault: () => Promise<number>;
  syncVault: () => Promise<void>;
}

function syncStatusFromStats(conflicts: number): VaultStore["syncStatus"] {
  return conflicts > 0 ? "conflicts" : "idle";
}

export const useVaultStore = create<VaultStore>((set, get) => ({
  vaultFolder: null,
  syncStatus: "disabled",
  conflictCount: 0,
  enabled: false,

  loadVaultStatus: async () => {
    const status = await commands.getVaultStatus();
    set({
      vaultFolder: status.vaultFolder,
      syncStatus: status.enabled ? "idle" : "disabled",
      enabled: status.enabled,
    });
  },

  setVaultFolder: async (path: string) => {
    set({ syncStatus: "syncing" });
    const stats = await commands.setVaultFolder(path);
    set({
      vaultFolder: path,
      enabled: true,
      syncStatus: syncStatusFromStats(stats.conflicts),
      conflictCount: stats.conflicts,
    });
    return stats;
  },

  clearVaultFolder: async () => {
    await commands.clearVaultFolder();
    set({
      vaultFolder: null,
      syncStatus: "disabled",
      conflictCount: 0,
      enabled: false,
    });
  },

  exportToVault: async () => {
    return await commands.exportToVault();
  },

  syncVault: async () => {
    set({ syncStatus: "syncing" });
    await commands.syncVault();
    const { conflictCount } = get();
    set({ syncStatus: syncStatusFromStats(conflictCount) });
  },
}));
