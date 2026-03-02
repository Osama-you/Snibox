import { platform } from "@/lib/platform";

export function ShortcutHints() {
  return (
    <div className="h-[32px] flex items-center justify-center gap-base px-md border-t border-border">
      <Hint keys={`${platform.modKey}+N`} label="new" />
      <Hint keys="Enter" label="copy" />
      <Hint keys={`${platform.modKey}+E`} label="edit" />
      <Hint keys="Esc" label="close" />
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="text-snippet-meta text-text-subtle flex items-center gap-[3px]">
      <kbd className="font-mono text-text-secondary">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}
