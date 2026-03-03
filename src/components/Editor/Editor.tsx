import { useCallback, useEffect, useRef, useState } from "react";
import { useSnippetStore } from "@/stores/snippetStore";
import { useEditorStore } from "@/stores/editorStore";
import { useKeybind } from "@/lib/keybinds";
import { useKeybindStore } from "@/stores/keybindStore";
import { commands } from "@/lib/commands";
import { TitleInput } from "./TitleInput";
import { ContentArea } from "./ContentArea";
import { TagsInput } from "./TagsInput";
import { EditorActions } from "./EditorActions";
import { ConfirmDialog } from "../Shared/ConfirmDialog";

const DRAFT_DEBOUNCE_MS = 500;

export function Editor() {
  const editingSnippetId = useSnippetStore((s) => s.editingSnippetId);
  const closeEditor = useSnippetStore((s) => s.closeEditor);
  const title = useEditorStore((s) => s.title);
  const content = useEditorStore((s) => s.content);
  const tags = useEditorStore((s) => s.tags);
  const isDirty = useEditorStore((s) => s.isDirty);
  const initEditor = useEditorStore((s) => s.initEditor);
  const reset = useEditorStore((s) => s.reset);
  const editorBinds = useKeybindStore((s) => s.editorBinds);
  const [showConfirm, setShowConfirm] = useState(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editingSnippetId) {
      commands.getSnippet(editingSnippetId).then((snippet) => {
        initEditor(snippet.title || "", snippet.content, snippet.tags);
      });
    } else {
      initEditor("", "", []);
    }
  }, [editingSnippetId, initEditor]);

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      if (title || content || tags.length > 0) {
        commands.saveDraft(editingSnippetId ?? null, title, content, tags);
      }
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [title, content, tags, editingSnippetId]);

  const handleSave = useCallback(async () => {
    if (editingSnippetId) {
      await commands.updateSnippet(editingSnippetId, title || null, content, tags);
    } else {
      await commands.createSnippet(title || null, content, tags);
    }
    await commands.discardDraft();
    reset();
    closeEditor();
  }, [editingSnippetId, title, content, tags, reset, closeEditor]);

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      commands.discardDraft();
      reset();
      closeEditor();
    }
  }, [isDirty, reset, closeEditor]);

  const handleDiscard = useCallback(async () => {
    await commands.discardDraft();
    reset();
    closeEditor();
    setShowConfirm(false);
  }, [reset, closeEditor]);

  useKeybind(editorBinds, {
    save: handleSave,
    cancel: handleCancel,
  });

  return (
    <div className="flex flex-col h-full p-base gap-md">
      <TitleInput />
      <ContentArea />
      <TagsInput />
      <EditorActions onSave={handleSave} onCancel={handleCancel} />

      {showConfirm && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have unsaved changes."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={handleDiscard}
          onCancel={() => setShowConfirm(false)}
          danger
        />
      )}
    </div>
  );
}
