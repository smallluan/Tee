import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const grammar = JSON.parse(
  readFileSync(join(root, "editor/vscode-tee/syntaxes/tee.tmLanguage.json"), "utf8"),
) as {
  repository: Record<string, { begin?: string; patterns?: unknown[]; contentName?: string }>;
};
const language = JSON.parse(
  readFileSync(join(root, "editor/vscode-tee/language-configuration.json"), "utf8"),
) as { brackets: string[][] };
const manifest = JSON.parse(readFileSync(join(root, "editor/vscode-tee/package.json"), "utf8")) as {
  contributes: { grammars: Array<{ embeddedLanguages: Record<string, string> }> };
};
const starter = readFileSync(join(root, "templates/starter/src/App.tee"), "utf8");

describe("Tee TextMate grammar", () => {
  it("does not treat angle brackets as pairs so => stays unmatched-red free", () => {
    expect(language.brackets).not.toContainEqual(["<", ">"]);
    expect(language.brackets).toContainEqual(["(", ")"]);
    expect(language.brackets).toContainEqual(["{{", "}}"]);
  });

  it("embeds Less with the VS Code grammar id, plus a local fallback", () => {
    const less = JSON.stringify(grammar.repository["style-less"]);
    expect(less).toContain("source.css.less");
    expect(less).toContain("#less-lite");
    expect(less).not.toMatch(/"source\.less"/);
    expect(manifest.contributes.grammars[0].embeddedLanguages["source.css.less"]).toBe("less");
  });

  it("highlights style tag attributes instead of swallowing them as unscoped text", () => {
    const less = JSON.stringify(grammar.repository["style-less"]);
    expect(less).toContain("#tag-open-rest");
    expect(grammar.repository["html-attr-dquote"]).toBeTruthy();
    expect(grammar.repository["html-attr-bare"]).toBeTruthy();
  });

  it("does not feed template expressions to TSX, so count < 5 stays an operator", () => {
    for (const name of ["directive-attr-dquote", "interpolation"] as const) {
      const json = JSON.stringify(grammar.repository[name]);
      expect(json).toContain("#tee-expr");
      expect(json).not.toContain('"source.ts"');
    }
    expect(starter).toContain('t-else-if="count < 5"');
  });

  it("matches the starter SFC script and Less style open tags", () => {
    const scriptBegin = new RegExp(grammar.repository.script.begin ?? "", "m");
    const lessBegin = new RegExp(grammar.repository["style-less"].begin ?? "", "m");
    expect(starter).toMatch(scriptBegin);
    expect(starter).toMatch(lessBegin);
    expect(starter).toContain("export default setup((self) => {");
    expect(starter).toContain("@paper: #f3ece0;");
  });
});
