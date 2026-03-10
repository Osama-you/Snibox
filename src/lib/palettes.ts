export interface Palette {
  id: string;
  label: string;
  c1: string;
  c2: string;
  c1Dark: string;
  c2Dark: string;
}

export const PALETTES: Palette[] = [
  {
    id: "ocean",
    label: "Ocean",
    c1: "225 80% 56%",
    c2: "210 70% 64%",
    c1Dark: "225 70% 64%",
    c2Dark: "210 65% 70%",
  },
  {
    id: "aurora",
    label: "Aurora",
    c1: "270 70% 58%",
    c2: "330 72% 60%",
    c1Dark: "270 65% 68%",
    c2Dark: "330 68% 68%",
  },
  {
    id: "ember",
    label: "Ember",
    c1: "25 90% 52%",
    c2: "0 78% 56%",
    c1Dark: "25 85% 62%",
    c2Dark: "0 72% 64%",
  },
  {
    id: "forest",
    label: "Forest",
    c1: "162 60% 38%",
    c2: "96 52% 44%",
    c1Dark: "162 55% 50%",
    c2Dark: "96 50% 54%",
  },
  {
    id: "sunset",
    label: "Sunset",
    c1: "38 88% 52%",
    c2: "18 84% 54%",
    c1Dark: "38 80% 62%",
    c2Dark: "18 78% 62%",
  },
  {
    id: "rose",
    label: "Rose",
    c1: "348 74% 54%",
    c2: "326 70% 56%",
    c1Dark: "348 68% 64%",
    c2Dark: "326 65% 64%",
  },
  {
    id: "violet",
    label: "Violet",
    c1: "258 68% 60%",
    c2: "238 64% 62%",
    c1Dark: "258 62% 70%",
    c2Dark: "238 60% 70%",
  },
];

export const DEFAULT_PALETTE_ID = "ocean";

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
