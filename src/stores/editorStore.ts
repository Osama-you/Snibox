import { create } from "zustand";

interface EditorSnapshot {
  title: string;
  content: string;
  tags: string[];
}

interface EditorStore {
  title: string;
  content: string;
  tags: string[];
  isDirty: boolean;
  originalSnapshot: EditorSnapshot | null;

  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setTags: (tags: string[]) => void;
  initEditor: (title: string, content: string, tags: string[]) => void;
  reset: () => void;
}

function computeDirty(
  title: string,
  content: string,
  tags: string[],
  snap: EditorSnapshot | null,
): boolean {
  if (!snap) return title !== "" || content !== "" || tags.length > 0;
  return (
    title !== snap.title ||
    content !== snap.content ||
    JSON.stringify(tags) !== JSON.stringify(snap.tags)
  );
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  title: "",
  content: "",
  tags: [],
  isDirty: false,
  originalSnapshot: null,

  setTitle: (title) => {
    const { content, tags, originalSnapshot } = get();
    set({ title, isDirty: computeDirty(title, content, tags, originalSnapshot) });
  },

  setContent: (content) => {
    const { title, tags, originalSnapshot } = get();
    set({ content, isDirty: computeDirty(title, content, tags, originalSnapshot) });
  },

  setTags: (tags) => {
    const { title, content, originalSnapshot } = get();
    set({ tags, isDirty: computeDirty(title, content, tags, originalSnapshot) });
  },

  initEditor: (title, content, tags) => {
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
}));
