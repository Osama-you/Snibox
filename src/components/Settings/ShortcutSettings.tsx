import { useCallback } from "react";
import { useKeybindStore } from "@/stores/keybindStore";
import { ShortcutRecorder } from "./ShortcutRecorder";
import type { KeybindDef } from "@/lib/keybinds";

const LAUNCHER_LABELS: Record<string, string> = {
  new: "New Snippet",
  moveUp: "Move Up",
  moveDown: "Move Down",
  copy: "Copy",
  pin: "Toggle Pin",
  edit: "Edit",
  delete: "Delete",
  close: "Close",
};

const EDITOR_LABELS: Record<string, string> = {
  save: "Save",
  cancel: "Cancel",
};

function BindGroup({
  title,
  group,
  labels,
  binds,
  onUpdate,
  onReset,
  isCustomized,
}: {
  title: string;
  group: "launcher" | "editor";
  labels: Record<string, string>;
  binds: Record<string, KeybindDef>;
  onUpdate: (group: "launcher" | "editor", action: string, def: KeybindDef) => void;
  onReset: (group: "launcher" | "editor", action: string) => void;
  isCustomized: (group: "launcher" | "editor", action: string) => boolean;
}) {
  return (
    <div className="mb-base">
      <h3 className="text-snippet-body font-medium text-text-secondary mb-sm">
        {title}
      </h3>
      <div className="flex flex-col gap-xs">
        {Object.entries(labels).map(([action, label]) => {
          const bind = binds[action];
          if (!bind) return null;
          const custom = isCustomized(group, action);
          return (
            <div
              key={action}
              className="flex items-center justify-between py-xs"
            >
              <span className="text-snippet-body text-text-primary">
                {label}
              </span>
              <div className="flex items-center gap-sm">
                <ShortcutRecorder
                  value={bind}
                  onChange={(def) => onUpdate(group, action, def)}
                  allBinds={binds}
                  currentAction={action}
                />
                {custom && (
                  <button
                    onClick={() => onReset(group, action)}
                    className="text-snippet-meta text-text-subtle hover:text-text-primary
                               transition-colors duration-75"
                    title="Reset to default"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M5.244 2.002a7 7 0 11-3.222 3.15.5.5 0 01.866.5A6 6 0 105.07 3.07L5.5 3.5H3.25a.75.75 0 010-1.5h3a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0V3.438l-.256-.256a.518.518 0 010 0l-.001-.001.001.001v-.001l-.002-.002.002.002a7.037 7.037 0 010 0l-.002-.003a.076.076 0 01.002.002l-.001-.001.001.001-1.18-1.177z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ShortcutSettings() {
  const launcherBinds = useKeybindStore((s) => s.launcherBinds);
  const editorBinds = useKeybindStore((s) => s.editorBinds);
  const updateKeybind = useKeybindStore((s) => s.updateKeybind);
  const resetKeybind = useKeybindStore((s) => s.resetKeybind);
  const resetAll = useKeybindStore((s) => s.resetAll);
  const isCustomized = useKeybindStore((s) => s.isCustomized);

  const hasAnyCustom = Object.keys(launcherBinds).some((a) =>
    isCustomized("launcher", a),
  ) || Object.keys(editorBinds).some((a) => isCustomized("editor", a));

  const handleResetAll = useCallback(async () => {
    await resetAll();
  }, [resetAll]);

  return (
    <section className="mb-xl">
      <h2 className="text-snippet-title font-semibold text-text-primary mb-md">
        Keyboard Shortcuts
      </h2>

      <div className="bg-bg-secondary rounded-md p-base border border-border">
        <BindGroup
          title="Launcher"
          group="launcher"
          labels={LAUNCHER_LABELS}
          binds={launcherBinds}
          onUpdate={updateKeybind}
          onReset={resetKeybind}
          isCustomized={isCustomized}
        />
        <BindGroup
          title="Editor"
          group="editor"
          labels={EDITOR_LABELS}
          binds={editorBinds}
          onUpdate={updateKeybind}
          onReset={resetKeybind}
          isCustomized={isCustomized}
        />

        {hasAnyCustom && (
          <button
            onClick={handleResetAll}
            className="mt-sm px-base py-xs bg-bg-primary border border-border text-text-primary
                       rounded hover:bg-bg-hover transition-colors duration-75 text-snippet-body"
          >
            Reset All to Defaults
          </button>
        )}
      </div>

      <p className="mt-sm text-snippet-meta text-text-tertiary">
        Click a shortcut to rebind it. Press Escape to cancel recording.
      </p>
    </section>
  );
}
