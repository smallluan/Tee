import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("create-tee", () => {
  it("scaffolds a Vite app with a .tee entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "create-tee-"));
    const dest = join(dir, "app");
    try {
      execFileSync(process.execPath, [join(process.cwd(), "scripts/pack-tee-vsix.mjs")], {
        encoding: "utf8",
      });
      execFileSync(process.execPath, [join(process.cwd(), "scripts/create-tee.mjs"), dest], {
        encoding: "utf8",
      });
      const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));
      expect(pkg.dependencies["tee-framework"]).toMatch(/^file:/);
      expect(readFileSync(join(dest, "src/App.tee"), "utf8")).toContain('import "./App.less"');
      expect(readFileSync(join(dest, "src/App.tee"), "utf8")).toContain("return (");
      expect(readFileSync(join(dest, "src/App.less"), "utf8")).toContain("@paper");
      expect(readFileSync(join(dest, "src/main.ts"), "utf8")).toContain("Tee.create");
      expect(readFileSync(join(dest, ".vscode/settings.json"), "utf8")).toContain('"*.tee": "tee"');
      expect(existsSync(join(dest, ".vscode/tee-language.vsix"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
