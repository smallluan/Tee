import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("create-tee", () => {
  it("scaffolds a Vite app with a .tee entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "create-tee-"));
    const dest = join(dir, "app");
    try {
      execFileSync(process.execPath, [join(process.cwd(), "scripts/create-tee.mjs"), dest], {
        encoding: "utf8",
      });
      const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));
      expect(pkg.dependencies.tee).toMatch(/^file:/);
      expect(readFileSync(join(dest, "src/App.tee"), "utf8")).toContain("lang=\"less\"");
      expect(readFileSync(join(dest, "src/main.ts"), "utf8")).toContain("Tee.create");
      expect(readFileSync(join(dest, ".vscode/settings.json"), "utf8")).toContain("*.tee");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
