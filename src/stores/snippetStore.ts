import { create } from "zustand";
import type { SnippetWithTags } from "@/lib/commands";
import { commands } from "@/lib/commands";
import { parseSearchQuery, activeFilterLabels } from "@/lib/search";

type Mode = "launcher" | "editor" | "settings";

interface SnippetStore {
  snippets: SnippetWithTags[];
  selectedIndex: number;
  searchQuery: string;
  activeTagFilter: string | null;
  activeFilters: string[];
  mode: Mode;
  editingSnippetId: string | null;

  setQuery: (query: string) => void;
  moveSelection: (delta: number) => void;
  selectIndex: (index: number) => void;
  setMode: (mode: Mode) => void;
  openEditor: (snippetId?: string) => void;
  openSettings: () => void;
  closeEditor: () => void;
  refreshSnippets: () => Promise<void>;
}

let latestSearchRequestId = 0;

async function fetchSnippets(query: string): Promise<{
  snippets: SnippetWithTags[];
  activeTagFilter: string | null;
  activeFilters: string[];
}> {
  const parsed = parseSearchQuery(query);
  const tagFilter = parsed.tags.length > 0 ? parsed.tags[0] : undefined;
  const textQuery = parsed.text || undefined;
  const snippets = await commands.listSnippets(textQuery, tagFilter, parsed.filters);
  return {
    snippets,
    activeTagFilter: tagFilter ?? null,
    activeFilters: activeFilterLabels(parsed),
  };
}

export const useSnippetStore = create<SnippetStore>((set, get) => ({
  snippets: [],
  selectedIndex: 0,
  searchQuery: "",
  activeTagFilter: null,
  activeFilters: [],
  mode: "launcher",
  editingSnippetId: null,

  setQuery: (query: string) => {
    const requestId = ++latestSearchRequestId;
    set({ searchQuery: query, selectedIndex: 0 });
    void fetchSnippets(query)
      .then(({ snippets, activeTagFilter, activeFilters }) => {
        if (requestId !== latestSearchRequestId) return;
        set({ snippets, activeTagFilter, activeFilters });
      })
      .catch(() => {
        if (requestId !== latestSearchRequestId) return;
        set({ snippets: [], activeTagFilter: null, activeFilters: [] });
      });
  },

  moveSelection: (delta: number) => {
    const { selectedIndex, snippets } = get();
    const next = Math.max(0, Math.min(snippets.length - 1, selectedIndex + delta));
    set({ selectedIndex: next });
  },

  selectIndex: (index: number) => set({ selectedIndex: index }),

  setMode: (mode: Mode) => set({ mode }),

  openEditor: (snippetId?: string) => {
    set({
      mode: "editor",
      editingSnippetId: snippetId ?? null,
    });
  },

  openSettings: () => {
    set({
      mode: "settings",
      editingSnippetId: null,
    });
  },

  closeEditor: () => {
    set({
      mode: "launcher",
      editingSnippetId: null,
    });
    void get().refreshSnippets();
  },

  refreshSnippets: async () => {
    const requestId = ++latestSearchRequestId;
    const { searchQuery } = get();
    const { snippets, activeTagFilter, activeFilters } = await fetchSnippets(searchQuery);
    if (requestId !== latestSearchRequestId) return;
    set({ snippets, activeTagFilter, activeFilters });
  },
}));
