export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
} as const;

export const WINDOW = {
  launcherWidth: 500,
  launcherHeight: 530,
  editorHeight: 590,
  minWidth: 400,
  minHeight: 300,
} as const;

export const ROW = {
  snippetHeight: 56,
  compactHeight: 44,
  searchInputHeight: 40,
  tagChipHeight: 24,
  footerHeight: 32,
} as const;

export const ANIMATION = {
  windowMs: 150,
  hoverMs: 80,
  selectionMs: 60,
  toastEnterMs: 200,
  toastExitMs: 150,
  toastDismissMs: 4000,
  modeSwitchMs: 180,
  confirmMs: 120,
} as const;

export const PREVIEW = {
  maxChars: 80,
  maxTitleChars: 40,
} as const;
