import { useState } from "react";
import { useSnippetStore } from "@/stores/snippetStore";
import { SyncSection } from "./SyncSection";
import { AppearanceSection } from "./AppearanceSection";
import { UpdatesSection } from "./UpdatesSection";
import { ShortcutSettings } from "./ShortcutSettings";

type Section = "sync" | "updates" | "appearance" | "shortcuts";

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "sync", label: "Sync" },
  { id: "updates", label: "Updates" },
  { id: "appearance", label: "Appearance" },
  { id: "shortcuts", label: "Shortcuts" },
];

export function Settings() {
  const closeSettings = useSnippetStore((s) => s.closeEditor);
  const [activeSection, setActiveSection] = useState<Section>("sync");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-base py-sm border-b border-border">
        <button
          onClick={closeSettings}
          className="inline-flex items-center gap-[6px] h-[28px] px-sm rounded-btn border border-transparent text-snippet-meta text-text-secondary hover:text-text-primary hover:bg-surface hover:border-border transition-colors"
          aria-label="Back"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M9.78 3.22a.75.75 0 010 1.06L6.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L4.47 8.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          <span>Back</span>
        </button>
        <h1 className="text-snippet-title text-text-primary">Settings</h1>
        <div className="w-[48px]" aria-hidden="true" />
      </div>

      <div className="flex flex-1 min-h-0">
        <nav aria-label="Settings sections" className="w-[120px] shrink-0 border-r border-border flex flex-col py-sm">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              aria-current={activeSection === item.id ? "page" : undefined}
              className={`w-full text-left px-base py-sm text-snippet-body transition-colors ${
                activeSection === item.id
                  ? "text-accent bg-accent/10 font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-border/30"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="app-scrollbar flex-1 px-base py-base pb-lg min-w-0">
          {activeSection === "sync" && <SyncSection />}
          {activeSection === "updates" && <UpdatesSection />}
          {activeSection === "appearance" && <AppearanceSection />}
          {activeSection === "shortcuts" && <ShortcutSettings />}
        </div>
      </div>
    </div>
  );
}
