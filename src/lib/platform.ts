const isMac = navigator.userAgent.includes("Mac");

export const platform = {
  isMac,
  modKey: isMac ? "⌘" : "Ctrl",
  modKeyCode: isMac ? "Meta" : "Control",

  formatShortcut(key: string, mod = false, shift = false): string {
    const parts: string[] = [];
    if (mod) parts.push(platform.modKey);
    if (shift) parts.push("Shift");
    parts.push(key);
    return parts.join(isMac ? "" : "+");
  },
};
