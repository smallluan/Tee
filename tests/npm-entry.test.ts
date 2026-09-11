import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("npm package entries", () => {
  it("publishes javascript, not typescript, so Node can load the Vite plugin", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.exports["."].import).toBe("./dist/index.js");
    expect(pkg.exports["./plugin"].import).toBe("./dist/plugin.js");
    expect(pkg.exports["./plugin"].import).not.toMatch(/\.ts$/);
  });
});
