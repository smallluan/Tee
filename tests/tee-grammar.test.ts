import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const grammar = JSON.parse(
  readFileSync(join(root, "editor/vscode-tee/syntaxes/tee.tmLanguage.json"), "utf8"),
) as { patterns: Array<{ include?: string }> };
const language = JSON.parse(
  readFileSync(join(root, "editor/vscode-tee/language-configuration.json"), "utf8"),
) as { brackets: string[][] };
const starter = readFileSync(join(root, "templates/starter/src/App.tee"), "utf8");

describe("Tee TextMate grammar", () => {
  it("highlights .tee as TSX, not a homemade HTML/Less embed", () => {
    expect(grammar.patterns).toEqual([{ include: "source.tsx" }]);
    expect(language.brackets).not.toContainEqual(["<", ">"]);
  });

  it("keeps styles out of the component file", () => {
    expect(starter).toContain('import "./App.less"');
    expect(starter).not.toContain("<style");
    expect(starter).not.toContain("<template>");
    expect(starter).toContain("return (");
  });
});
