import { describe, expect, it } from "vitest";

import { safeHref } from "./safe-markdown.js";

describe("safe Markdown links", () => {
  it("allows only explicit web, mail, and internal fragment links", () => {
    expect(safeHref("https://example.com/plan")).toBe("https://example.com/plan");
    expect(safeHref("mailto:plans@example.com")).toBe("mailto:plans@example.com");
    expect(safeHref("#criterion.saved-after-success")).toBe("#criterion.saved-after-success");
  });

  it("does not turn script-like or malformed destinations into links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,unsafe")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});
