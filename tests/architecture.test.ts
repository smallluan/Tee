import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe("architecture", () => {
  it("does not implement a virtual DOM", () => {
    const files = walk(join(process.cwd(), "src/tee"));
    const sources = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(sources).not.toMatch(/\bVNode\b/);
    expect(sources).not.toMatch(/\bcreateVNode\b/);
    expect(sources).not.toMatch(/\bVirtualNode\b/);
  });
});
