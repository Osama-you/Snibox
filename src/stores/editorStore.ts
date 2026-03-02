import { create } from "zustand";

interface EditorStore {
  title: string;
  content: string;
  tags: string[];
  isDirty: boolean;
  originalSnapshot: { title: string; content: string; tags: string[] } | null;

  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setTags: (tags: string[]) => void;
  initEditor: (title: string, content: string, tags: string[]) => void;
  reset: () => void;
  computeDirty: () => boolean;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  title: "",
  content: "",
  tags: [],
  isDirty: false,
  originalSnapshot: null,

  setTitle: (title: string) => {
    set({ title });
    set({ isDirty: get().computeDirty() });
  },

  setContent: (content: string) => {
    set({ content });
    set({ isDirty: get().computeDirty() });
  },

  setTags: (tags: string[]) => {
    set({ tags });
    set({ isDirty: get().computeDirty() });
  },

  initEditor: (title: string, content: string, tags: string[]) => {
    set({
      title,
      content,
      tags,
      isDirty: false,
      originalSnapshot: { title, content, tags: [...tags] },
    });
  },

  reset: () => {
    set({
      title: "",
      content: "",
      tags: [],
      isDirty: false,
      originalSnapshot: null,
    });
  },

  computeDirty: () => {
    const { title, content, tags, originalSnapshot } = get();
    if (!originalSnapshot) return title !== "" || content !== "" || tags.length > 0;
    return (
      title !== originalSnapshot.title ||
      content !== originalSnapshot.content ||
      JSON.stringify(tags) !== JSON.stringify(originalSnapshot.tags)
    );
  },
}));
