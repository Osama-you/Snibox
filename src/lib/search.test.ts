import { describe, expect, it } from "vitest";
import { activeFilterLabels, parseSearchQuery } from "./search";

describe("parseSearchQuery", () => {
  it("extracts text, tags, and power-user operators", () => {
    const parsed = parseSearchQuery("deploy #ops is:pinned used:recent updated:today");

    expect(parsed.text).toBe("deploy");
    expect(parsed.tags).toEqual(["ops"]);
    expect(parsed.filters).toEqual({
      pinnedOnly: true,
      usedRecent: true,
      updatedToday: true,
    });
    expect(activeFilterLabels(parsed)).toEqual([
      "#ops",
      "is:pinned",
      "used:recent",
      "updated:today",
    ]);
  });

  it("handles case variations, aliases, and common operator typos", () => {
    const parsed = parseSearchQuery("Deploy TAG:Ops is:pimmed USED:RECNET UPDATED:TODAY");

    expect(parsed.text).toBe("Deploy");
    expect(parsed.tags).toEqual(["ops"]);
    expect(parsed.filters).toEqual({
      pinnedOnly: true,
      usedRecent: true,
      updatedToday: true,
    });
  });
});
