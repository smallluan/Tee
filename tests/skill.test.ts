import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const skill = join(process.cwd(), "skill");

describe("Tee skill pack", () => {
  it("indexes only files that exist", () => {
    const index = readFileSync(join(skill, "SKILL.md"), "utf8");
    const linked = [...index.matchAll(/\[([^\]]+\.md)\]\(\1\)/g)].map((match) => match[1]);
    expect(linked.length).toBeGreaterThan(8);
    for (const file of linked) {
      expect(existsSync(join(skill, file)), file).toBe(true);
    }
  });

  it("splits topics instead of one dump", () => {
    const files = readdirSync(skill).filter((name) => name.endsWith(".md"));
    expect(files).toEqual(
      expect.arrayContaining([
        "SKILL.md",
        "contract.md",
        "lists.md",
        "events.md",
        "components.md",
        "pitfalls.md",
        "api.md",
      ]),
    );
    expect(files.length).toBeGreaterThanOrEqual(14);
  });
});
