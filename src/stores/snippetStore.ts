import { create } from "zustand";
import type { SnippetWithTags } from "@/lib/commands";
import { commands } from "@/lib/commands";
import { parseSearchQuery } from "@/lib/search";

type Mode = "launcher" | "editor" | "settings";

interface SnippetStore {
  snippets: SnippetWithTags[];
  selectedIndex: number;
  searchQuery: string;
  activeTagFilter: string | null;
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

export const useSnippetStore = create<SnippetStore>((set, get) => ({
  snippets: [],
  selectedIndex: 0,
  searchQuery: "",
  activeTagFilter: null,
  mode: "launcher",
  editingSnippetId: null,

  setQuery: (query: string) => {
    set({ searchQuery: query, selectedIndex: 0 });
    const parsed = parseSearchQuery(query);
    const tagFilter = parsed.tags.length > 0 ? parsed.tags[0] : undefined;
    const textQuery = parsed.text || undefined;
    commands.listSnippets(textQuery, tagFilter).then((snippets) => {
      set({ snippets, activeTagFilter: tagFilter ?? null });
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
    get().refreshSnippets();
  },

  refreshSnippets: async () => {
    const { searchQuery } = get();
    const parsed = parseSearchQuery(searchQuery);
    const tagFilter = parsed.tags.length > 0 ? parsed.tags[0] : undefined;
    const textQuery = parsed.text || undefined;
    const snippets = await commands.listSnippets(textQuery, tagFilter);
    set({ snippets });
  },
}));
