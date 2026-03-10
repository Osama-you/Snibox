import { useSettingsStore } from "@/stores/settingsStore";
import { PALETTES } from "@/lib/palettes";

const THEME_OPTIONS: { value: "light" | "dark" | "auto"; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "System" },
];

export function AppearanceSection() {
  const theme = useSettingsStore((s) => s.theme);
  const accentPalette = useSettingsStore((s) => s.accentPalette);
  const setSetting = useSettingsStore((s) => s.setSetting);

  return (
    <section className="space-y-base">
      <div className="space-y-md">
        <h2 className="text-snippet-meta text-text-secondary uppercase tracking-wide">Theme</h2>
        <div className="flex gap-sm">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => void setSetting("theme", option.value)}
              aria-pressed={theme === option.value}
              className={`flex-1 h-[32px] rounded-btn border text-snippet-body transition-colors ${
                theme === option.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface text-text-primary hover:bg-border/40"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-md">
        <h2 className="text-snippet-meta text-text-secondary uppercase tracking-wide">Accent color</h2>
        <div className="flex flex-wrap gap-[10px]">
          {PALETTES.map((palette) => {
            const isActive = accentPalette === palette.id;
            return (
              <button
                key={palette.id}
                aria-label={`${palette.label} accent color${isActive ? " (active)" : ""}`}
                aria-pressed={isActive}
                onClick={() => void setSetting("accent_palette", palette.id)}
                className={`w-7 h-7 rounded-full transition-all ${
                  isActive
                    ? "ring-2 ring-offset-2 ring-offset-bg scale-110"
                    : "hover:scale-110 opacity-80 hover:opacity-100"
                }`}
                style={{
                  background: `linear-gradient(135deg, hsl(${palette.c1}), hsl(${palette.c2}))`,
                  ...(isActive ? { boxShadow: `0 0 0 2px hsl(${palette.c1} / 0.5)` } : {}),
                }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
