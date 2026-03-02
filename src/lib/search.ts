interface ParsedQuery {
  text: string;
  tags: string[];
}

export function parseSearchQuery(input: string): ParsedQuery {
  const tags: string[] = [];
  const textParts: string[] = [];

  const tokens = input.trim().split(/\s+/);
  for (const token of tokens) {
    if (token.startsWith("#") && token.length > 1) {
      tags.push(token.slice(1).toLowerCase());
    } else if (token.startsWith("tag:") && token.length > 4) {
      tags.push(token.slice(4).toLowerCase());
    } else {
      textParts.push(token);
    }
  }

  return { text: textParts.join(" "), tags };
}

export function truncatePreview(content: string, maxChars = 80): string {
  const firstLine = content.split("\n")[0] || "";
  const trimmed = firstLine.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars) + "...";
}

export function highlightMatches(
  text: string,
  query: string,
): { text: string; highlighted: boolean }[] {
  if (!query.trim()) return [{ text, highlighted: false }];

  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [{ text, highlighted: false }];

  const pattern = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");
  const parts: { text: string; highlighted: boolean }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const idx = match.index!;
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
