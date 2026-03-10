import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncStore } from "./syncStore";
import { commands } from "@/lib/commands";

vi.mock("@/lib/commands", () => ({
  commands: {
    getSyncStatus: vi.fn(),
    listSyncConflicts: vi.fn(),
    listSyncActivity: vi.fn(),
    driveStartAuth: vi.fn(),
    driveCompleteAuth: vi.fn(),
    driveDisconnect: vi.fn(),
    retrySync: vi.fn(),
    resolveSyncConflict: vi.fn(),
    copyText: vi.fn(),
  },
}));

describe("syncStore", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: null,
      conflicts: [],
      activity: [],
      loading: false,
      pendingAuth: null,
    });
    vi.clearAllMocks();
  });

  it("refreshes status, conflicts, and activity together", async () => {
    vi.mocked(commands.getSyncStatus).mockResolvedValue({
      provider: "google_drive",
      connected: true,
      syncStatus: "idle",
      lastSynced: "2026-03-10T10:00:00Z",
      queueDepth: 2,
      conflictCount: 1,
      lastError: null,
      needsReauth: false,
    });
    vi.mocked(commands.listSyncConflicts).mockResolvedValue([
      {
        id: "conflict-1",
        snippetId: "snippet-1",
        reason: "remote_changed_while_local_pending",
        status: "open",
        localSnippet: {
          id: "snippet-1",
          title: "Local",
          content: "local",
          tags: [],
          pinned: false,
          created_at: "2026-03-10T09:00:00Z",
          updated_at: "2026-03-10T09:00:00Z",
          last_used_at: null,
          use_count: 0,
          sync_state: "conflicted",
          last_synced_at: null,
          remote_version: null,
          deleted_at: null,
          conflict_parent_id: null,
          device_updated_at: "2026-03-10T09:00:00Z",
        },
        remoteSnippet: {
          id: "snippet-1",
          title: "Remote",
          content: "remote",
          tags: [],
          pinned: false,
          created_at: "2026-03-10T09:00:00Z",
          updated_at: "2026-03-10T10:00:00Z",
        },
        createdAt: "2026-03-10T10:00:00Z",
        updatedAt: "2026-03-10T10:00:00Z",
      },
    ]);
    vi.mocked(commands.listSyncActivity).mockResolvedValue([
      {
        id: 1,
        level: "info",
        action: "queue",
        message: "Queued upsert for sync",
        snippetId: "snippet-1",
        createdAt: "2026-03-10T10:00:00Z",
      },
    ]);

    await useSyncStore.getState().refresh();

    const state = useSyncStore.getState();
    expect(state.status?.queueDepth).toBe(2);
    expect(state.conflicts).toHaveLength(1);
    expect(state.activity).toHaveLength(1);
  });
});
