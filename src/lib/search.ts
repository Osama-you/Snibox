export interface ParsedQuery {
  text: string;
  tags: string[];
  filters: {
    pinnedOnly: boolean;
    usedRecent: boolean;
    updatedToday: boolean;
  };
}

export function parseSearchQuery(input: string): ParsedQuery {
  const tags: string[] = [];
  const textParts: string[] = [];
  const filters = {
    pinnedOnly: false,
    usedRecent: false,
    updatedToday: false,
  };

  const tokens = input.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const normalized = token.toLowerCase();

    if (normalized.startsWith("#") && normalized.length > 1) {
      tags.push(normalized.slice(1));
      continue;
    }

    if ((normalized.startsWith("tag:") || normalized.startsWith("tags:")) && normalized.length > 4) {
      const value = normalized.startsWith("tags:")
        ? normalized.slice(5)
        : normalized.slice(4);
      if (value) tags.push(value);
      continue;
    }

    if (isPinnedOperator(normalized)) {
      filters.pinnedOnly = true;
      continue;
    }

    if (isUsedRecentOperator(normalized)) {
      filters.usedRecent = true;
      continue;
    }

    if (isUpdatedTodayOperator(normalized)) {
      filters.updatedToday = true;
      continue;
    }

    textParts.push(token);
  }

  return { text: textParts.join(" "), tags, filters };
}

export function activeFilterLabels(parsed: ParsedQuery): string[] {
  const labels: string[] = [];
  if (parsed.tags[0]) labels.push(`#${parsed.tags[0]}`);
  if (parsed.filters.pinnedOnly) labels.push("is:pinned");
  if (parsed.filters.usedRecent) labels.push("used:recent");
  if (parsed.filters.updatedToday) labels.push("updated:today");
  return labels;
}

export function truncatePreview(content: string, maxChars = 80): string {
  const firstLine = content.split("\n")[0] || "";
  const trimmed = firstLine.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}...`;
}

export function highlightMatches(
  text: string,
  query: string,
): { text: string; highlighted: boolean }[] {
  if (!query.trim()) return [{ text, highlighted: false }];

  const parsed = parseSearchQuery(query);
  const terms = parsed.text
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  if (terms.length === 0) return [{ text, highlighted: false }];

  const pattern = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");
  const parts: { text: string; highlighted: boolean }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      parts.push({ text: text.slice(lastIndex, idx), highlighted: false });
    }
    parts.push({ text: match[0], highlighted: true });
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return parts.length > 0 ? parts : [{ text, highlighted: false }];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPinnedOperator(token: string): boolean {
  if (token === "is:pinned" || token === "is:pin" || token === "pinned") {
    return true;
  }
  if (!token.startsWith("is:")) return false;
  const value = token.slice(3);
  return levenshtein(value, "pinned") <= 2;
}

function isUsedRecentOperator(token: string): boolean {
  if (token === "used:recent") return true;
  if (!token.startsWith("used:")) return false;
  const value = token.slice(5);
  return levenshtein(value, "recent") <= 2;
}

function isUpdatedTodayOperator(token: string): boolean {
  if (token === "updated:today") return true;
  if (!token.startsWith("updated:")) return false;
  const value = token.slice(8);
  return levenshtein(value, "today") <= 1;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}
