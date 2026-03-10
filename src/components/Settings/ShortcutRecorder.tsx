import { useEffect, useRef, useState } from "react";
import { platform } from "@/lib/platform";
import type { KeybindDef } from "@/lib/keybinds";

const MODIFIER_KEYS = new Set([
  "Control",
  "Meta",
  "Alt",
  "Shift",
  "CapsLock",
]);

const DISPLAY_MAP: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Delete: "Del",
  Backspace: "Backspace",
  Enter: "Enter",
  " ": "Space",
  Tab: "Tab",
};

function formatDef(def: KeybindDef): string {
  const displayKey = DISPLAY_MAP[def.key] ?? def.key.toUpperCase();
  return platform.formatShortcut(displayKey, !!def.mod, !!def.shift);
}

interface ShortcutRecorderProps {
  value: KeybindDef;
  onChange: (def: KeybindDef) => void;
  allBinds: Record<string, KeybindDef>;
  currentAction: string;
}

export function ShortcutRecorder({
  value,
  onChange,
  allBinds,
  currentAction,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        setConflict(null);
        return;
      }

      if (MODIFIER_KEYS.has(e.key)) return;

      const mod = platform.isMac ? e.metaKey : e.ctrlKey;
      const shift = e.shiftKey;
      const newDef: KeybindDef = {
        key: e.key,
        ...(mod && { mod: true }),
        ...(shift && { shift: true }),
      };

      const serialized = `${newDef.key},${!!newDef.mod},${!!newDef.shift}`;
      for (const [action, bind] of Object.entries(allBinds)) {
        if (action === currentAction) continue;
        const existing = `${bind.key},${!!bind.mod},${!!bind.shift}`;
        if (serialized === existing) {
          setConflict(action);
          return;
        }
      }

      setConflict(null);
      setRecording(false);
      onChange(newDef);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording, allBinds, currentAction, onChange]);

  useEffect(() => {
    if (!recording) return;
    const handler = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setRecording(false);
        setConflict(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [recording]);

  return (
    <div className="flex flex-col items-end gap-xs">
      <button
        ref={buttonRef}
        onClick={() => {
          setRecording(!recording);
          setConflict(null);
        }}
        className={`min-w-[100px] px-sm py-xs rounded border text-snippet-body font-mono
                     transition-all duration-75 text-center ${
                       recording
                         ? "border-accent bg-accent/10 text-accent animate-pulse"
                         : "border-border bg-bg text-text-primary hover:bg-border/40"
                     }`}
      >
        {recording ? "Press keys..." : formatDef(value)}
      </button>
      {conflict && (
        <span className="text-[11px] text-danger">
          Conflicts with "{conflict}"
        </span>
      )}
    </div>
  );
}
